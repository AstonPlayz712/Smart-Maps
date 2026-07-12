import 'package:equatable/equatable.dart';
import 'package:riverpod/riverpod.dart';

import '../models/sonic_event.dart';

enum SonicPhase { idle, speaking, earcon, ducking, quietHours }

class SonicSnapshot extends Equatable {
  SonicSnapshot({
    required this.phase,
    this.currentEvent,
    List<SonicEvent>? queue,
    required this.isMediaDucked,
    required this.isQuietHours,
    required this.quietHoursStart,
    required this.quietHoursEnd,
    required double volume,
  })  : queue = List.unmodifiable(queue ?? const []),
        volume = volume.clamp(0, 1).toDouble();

  final SonicPhase phase;
  final SonicEvent? currentEvent;
  final List<SonicEvent> queue;
  final bool isMediaDucked;
  final bool isQuietHours;
  final int quietHoursStart;
  final int quietHoursEnd;
  final double volume;

  SonicSnapshot copyWith({
    SonicPhase? phase,
    Object? currentEvent = _sentinel,
    List<SonicEvent>? queue,
    bool? isMediaDucked,
    bool? isQuietHours,
    int? quietHoursStart,
    int? quietHoursEnd,
    double? volume,
  }) {
    return SonicSnapshot(
      phase: phase ?? this.phase,
      currentEvent: identical(currentEvent, _sentinel)
          ? this.currentEvent
          : currentEvent as SonicEvent?,
      queue: queue ?? this.queue,
      isMediaDucked: isMediaDucked ?? this.isMediaDucked,
      isQuietHours: isQuietHours ?? this.isQuietHours,
      quietHoursStart: quietHoursStart ?? this.quietHoursStart,
      quietHoursEnd: quietHoursEnd ?? this.quietHoursEnd,
      volume: volume ?? this.volume,
    );
  }

  @override
  List<Object?> get props => [
        phase,
        currentEvent,
        queue,
        isMediaDucked,
        isQuietHours,
        quietHoursStart,
        quietHoursEnd,
        volume,
      ];
}

class SonicStateMachine extends StateNotifier<SonicSnapshot> {
  SonicStateMachine()
      : super(
          SonicSnapshot(
            phase: SonicPhase.idle,
            isMediaDucked: false,
            isQuietHours: false,
            quietHoursStart: 2300,
            quietHoursEnd: 700,
            volume: 1,
          ),
        );

  void enqueue(SonicEvent event) {
    if (event.expiresAt != null && event.expiresAt!.isBefore(DateTime.now())) {
      return;
    }
    final nextQueue = [...state.queue, event]..sort(_compareEvents);
    state = state.copyWith(queue: nextQueue);
  }

  void processNext() {
    final quiet = checkQuietHours();
    final nextQueue = state.queue
        .where((event) => event.expiresAt == null || event.expiresAt!.isAfter(DateTime.now()))
        .toList();

    if (nextQueue.isEmpty) {
      state = state.copyWith(
        phase: quiet ? SonicPhase.quietHours : SonicPhase.idle,
        currentEvent: null,
        queue: const [],
      );
      return;
    }

    final nextEvent = nextQueue.first;
    if (quiet && nextEvent.priority != SonicPriority.urgent) {
      state = state.copyWith(
        phase: SonicPhase.quietHours,
        queue: nextQueue,
        currentEvent: null,
      );
      return;
    }

    final remainingQueue = List<SonicEvent>.unmodifiable(nextQueue.sublist(1));
    final nextPhase = nextEvent.earconAsset != null && nextEvent.textToSpeak == null
        ? SonicPhase.earcon
        : SonicPhase.speaking;
    final shouldDuck = nextEvent.shouldDuckMedia;

    state = state.copyWith(
      phase: shouldDuck ? SonicPhase.ducking : nextPhase,
      currentEvent: nextEvent,
      queue: remainingQueue,
      isMediaDucked: shouldDuck || state.isMediaDucked,
      isQuietHours: quiet,
    );

    if (!shouldDuck) {
      state = state.copyWith(phase: nextPhase);
    }
  }

  void markComplete() {
    final shouldUnduck = state.currentEvent?.shouldDuckMedia ?? false;
    state = state.copyWith(
      currentEvent: null,
      isMediaDucked: shouldUnduck ? false : state.isMediaDucked,
    );
    if (state.queue.isNotEmpty) {
      processNext();
      return;
    }
    final quiet = checkQuietHours();
    state = state.copyWith(phase: quiet ? SonicPhase.quietHours : SonicPhase.idle);
  }

  void duckMedia() {
    state = state.copyWith(phase: SonicPhase.ducking, isMediaDucked: true);
  }

  void unduckMedia() {
    state = state.copyWith(
      phase: state.currentEvent == null
          ? (state.isQuietHours ? SonicPhase.quietHours : SonicPhase.idle)
          : state.phase,
      isMediaDucked: false,
    );
  }

  void setQuietHours(int start, int end) {
    final quiet = _isWithinQuietHours(DateTime.now(), start, end);
    state = state.copyWith(
      quietHoursStart: start,
      quietHoursEnd: end,
      isQuietHours: quiet,
      phase: quiet && state.currentEvent == null ? SonicPhase.quietHours : state.phase,
    );
  }

  bool checkQuietHours() {
    final quiet = _isWithinQuietHours(
      DateTime.now(),
      state.quietHoursStart,
      state.quietHoursEnd,
    );
    state = state.copyWith(
      isQuietHours: quiet,
      phase: quiet && state.currentEvent == null ? SonicPhase.quietHours : state.phase,
    );
    return quiet;
  }

  void setVolume(double v) {
    state = state.copyWith(volume: v);
  }

  static int _priorityRank(SonicPriority priority) => switch (priority) {
        SonicPriority.urgent => 0,
        SonicPriority.high => 1,
        SonicPriority.normal => 2,
        SonicPriority.low => 3,
      };

  static int _compareEvents(SonicEvent a, SonicEvent b) {
    final byPriority = _priorityRank(a.priority).compareTo(_priorityRank(b.priority));
    if (byPriority != 0) {
      return byPriority;
    }
    return a.createdAt.compareTo(b.createdAt);
  }

  bool _isWithinQuietHours(DateTime now, int start, int end) {
    final hhmm = (now.hour * 100) + now.minute;
    if (start == end) {
      return true;
    }
    if (start < end) {
      return hhmm >= start && hhmm <= end;
    }
    return hhmm >= start || hhmm <= end;
  }
}

const Object _sentinel = Object();
