import 'dart:async';

import 'package:collection/collection.dart';

import '../../models/mode_strand.dart';
import '../../models/sonic_event.dart';
import 'earcon_player.dart';
import 'media_ducker.dart';
import 'voice_lines.dart';

class SonicEngine {
  final PriorityQueue<SonicEvent> _queue;
  bool _isPlaying = false;
  bool _isMediaDucked = false;
  bool _isQuietHours = false;
  int _quietStart = 2200;
  int _quietEnd = 700;
  double _volume = 1.0;
  final VoiceLines _voiceLines = const VoiceLines();
  final EarconPlayer _earconPlayer = EarconPlayer();
  final MediaDucker _mediaDucker = MediaDucker();
  final StreamController<SonicEvent> _onEventStarted =
      StreamController<SonicEvent>.broadcast();
  final StreamController<SonicEvent> _onEventCompleted =
      StreamController<SonicEvent>.broadcast();
  Timer? _processingTimer;
  SonicEvent? _currentEvent;
  int _sequence = 0;

  SonicEngine() : _queue = HeapPriorityQueue<SonicEvent>(_compareEvents);

  void enqueue(SonicEvent event) {
    if (_isPlaying && event.isUrgent) {
      _processingTimer?.cancel();
      final interrupted = _currentEvent;
      _currentEvent = null;
      _isPlaying = false;
      if (interrupted != null) {
        _queue.add(interrupted);
      }
    }
    _queue.add(event);
    processNext();
  }

  void processNext() {
    if (_isPlaying || _queue.isEmpty) {
      return;
    }

    final event = _queue.removeFirst();
    if (checkQuietHours() && !event.isUrgent) {
      _onEventCompleted.add(event);
      processNext();
      return;
    }

    _currentEvent = event;
    _isPlaying = true;
    duck();
    _onEventStarted.add(event);

    final pan = _panForBearing(event.bearingDeg);
    switch (event.type) {
      case SonicEventType.maneuver:
        final line = event.maneuverInstruction != null
            ? VoiceLines.maneuver(event.maneuverInstruction!)
            : VoiceLine(event.text ?? 'Continue', event.priority, panAngle: pan);
        _voiceLines.speak(line, volume: _volume);
        break;
      case SonicEventType.reroute:
        _voiceLines.speak(VoiceLines.reroute(), volume: _volume);
        _earconPlayer.play(EarconAsset.reroute, panAngle: pan);
        break;
      case SonicEventType.arrival:
        _voiceLines.speak(
          VoiceLines.arrival(event.text ?? 'your destination'),
          volume: _volume,
        );
        _earconPlayer.play(EarconAsset.arrival, panAngle: pan);
        break;
      case SonicEventType.disruption:
        _voiceLines.speak(
          VoiceLines.disruption(event.text ?? 'Please expect delays.'),
          volume: _volume,
        );
        _earconPlayer.play(EarconAsset.disruption, panAngle: pan);
        break;
      case SonicEventType.transit:
        _voiceLines.speak(
          VoiceLine(event.text ?? '', event.priority, panAngle: pan),
          volume: _volume,
        );
        break;
      case SonicEventType.approaching:
        _voiceLines.speak(
          VoiceLines.approaching(event.text ?? 'destination'),
          volume: _volume,
        );
        break;
      case SonicEventType.earcon:
        _earconPlayer.play(event.assetPath ?? EarconAsset.wakeWord, panAngle: pan);
        break;
    }

    _processingTimer?.cancel();
    _processingTimer = Timer(
      event.duration ?? _estimateDuration(event),
      () => markComplete(event.id),
    );
  }

  void markComplete(String eventId) {
    if (_currentEvent == null || _currentEvent!.id != eventId) {
      return;
    }
    final completed = _currentEvent!;
    _processingTimer?.cancel();
    _processingTimer = null;
    _currentEvent = null;
    _isPlaying = false;
    _onEventCompleted.add(completed);
    if (_queue.isEmpty) {
      unduck();
    }
    processNext();
  }

  void setVolume(double v) {
    _volume = v.clamp(0.0, 1.0).toDouble();
    _earconPlayer.setVolume(_volume);
  }

  void setQuietHours(int start, int end) {
    _quietStart = start;
    _quietEnd = end;
    checkQuietHours();
  }

  bool checkQuietHours() {
    final now = DateTime.now();
    final current = now.hour * 100 + now.minute;
    if (_quietStart == _quietEnd) {
      _isQuietHours = false;
    } else if (_quietStart < _quietEnd) {
      _isQuietHours = current >= _quietStart && current < _quietEnd;
    } else {
      _isQuietHours = current >= _quietStart || current < _quietEnd;
    }
    return _isQuietHours;
  }

  void duck() {
    if (_isMediaDucked) {
      return;
    }
    _mediaDucker.duck();
    _isMediaDucked = true;
  }

  void unduck() {
    if (!_isMediaDucked) {
      return;
    }
    _mediaDucker.unduck();
    _isMediaDucked = false;
  }

  void dispose() {
    _processingTimer?.cancel();
    _queue.clear();
    _currentEvent = null;
    _isPlaying = false;
    unduck();
    _onEventStarted.close();
    _onEventCompleted.close();
    _earconPlayer.dispose();
    _mediaDucker.dispose();
  }

  Stream<SonicEvent> get onEventStarted => _onEventStarted.stream;

  Stream<SonicEvent> get onEventCompleted => _onEventCompleted.stream;

  void enqueueManeuver(ManeuverInstruction instruction) {
    final line = VoiceLines.maneuver(instruction);
    enqueue(
      SonicEvent(
        id: _nextId('maneuver'),
        type: SonicEventType.maneuver,
        priority: line.priority,
        text: line.text,
        bearingDeg: instruction.bearingDeg,
        maneuverInstruction: instruction,
      ),
    );
  }

  void enqueueReroute() {
    enqueue(
      SonicEvent(
        id: _nextId('reroute'),
        type: SonicEventType.reroute,
        priority: SonicPriority.urgent,
        text: 'Rerouting…',
      ),
    );
  }

  void enqueueArrival(String destinationName) {
    enqueue(
      SonicEvent(
        id: _nextId('arrival'),
        type: SonicEventType.arrival,
        priority: SonicPriority.high,
        text: destinationName,
      ),
    );
  }

  void enqueueDisruption(String summary) {
    enqueue(
      SonicEvent(
        id: _nextId('disruption'),
        type: SonicEventType.disruption,
        priority: SonicPriority.high,
        text: summary,
      ),
    );
  }

  void enqueueEarcon(String asset) {
    enqueue(
      SonicEvent(
        id: _nextId('earcon'),
        type: SonicEventType.earcon,
        priority: SonicPriority.normal,
        assetPath: asset,
        duration: const Duration(milliseconds: 700),
      ),
    );
  }

  double? _panForBearing(double? bearingDeg) {
    if (bearingDeg == null) {
      return null;
    }
    final normalized = ((bearingDeg + 540.0) % 360.0) - 180.0;
    return (normalized / 90.0).clamp(-1.0, 1.0).toDouble();
  }

  Duration _estimateDuration(SonicEvent event) {
    final source = event.text ?? event.assetPath ?? '';
    if (source.isEmpty) {
      return const Duration(milliseconds: 900);
    }
    final millis = (source.split(RegExp(r'\s+')).length * 420).clamp(700, 4500);
    return Duration(milliseconds: millis);
  }

  String _nextId(String prefix) {
    _sequence += 1;
    return '$prefix-${DateTime.now().microsecondsSinceEpoch}-$_sequence';
  }

  static int _compareEvents(SonicEvent a, SonicEvent b) {
    final priorityCompare = b.priority.index.compareTo(a.priority.index);
    if (priorityCompare != 0) {
      return priorityCompare;
    }
    final timeCompare = a.createdAt.compareTo(b.createdAt);
    if (timeCompare != 0) {
      return timeCompare;
    }
    return a.id.compareTo(b.id);
  }
}
