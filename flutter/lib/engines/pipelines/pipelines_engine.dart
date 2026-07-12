import 'dart:async';
import 'dart:math';

import 'package:uuid/uuid.dart';

final Uuid _uuid = Uuid();

enum LineStatus { normal, minorDelays, majorDelays, suspended, partialService }

class TransitLineHealth {
  const TransitLineHealth({
    required this.lineId,
    required this.lineName,
    required this.healthScore,
    required this.status,
    required this.degradedSegments,
    required this.lastUpdated,
  });

  final String lineId;
  final String lineName;
  final double healthScore;
  final LineStatus status;
  final List<DegradedSegment> degradedSegments;
  final DateTime lastUpdated;

  TransitLineHealth copyWith({
    String? lineId,
    String? lineName,
    double? healthScore,
    LineStatus? status,
    List<DegradedSegment>? degradedSegments,
    DateTime? lastUpdated,
  }) {
    return TransitLineHealth(
      lineId: lineId ?? this.lineId,
      lineName: lineName ?? this.lineName,
      healthScore: healthScore ?? this.healthScore,
      status: status ?? this.status,
      degradedSegments: degradedSegments ?? this.degradedSegments,
      lastUpdated: lastUpdated ?? this.lastUpdated,
    );
  }
}

class DegradedSegment {
  const DegradedSegment({
    required this.id,
    required this.lineId,
    required this.fromStopId,
    required this.toStopId,
    required this.reason,
    required this.severity,
    this.estimatedResolution,
  });

  final String id;
  final String lineId;
  final String fromStopId;
  final String toStopId;
  final String reason;
  final double severity;
  final DateTime? estimatedResolution;

  DegradedSegment copyWith({
    String? id,
    String? lineId,
    String? fromStopId,
    String? toStopId,
    String? reason,
    double? severity,
    DateTime? estimatedResolution,
  }) {
    return DegradedSegment(
      id: id ?? this.id,
      lineId: lineId ?? this.lineId,
      fromStopId: fromStopId ?? this.fromStopId,
      toStopId: toStopId ?? this.toStopId,
      reason: reason ?? this.reason,
      severity: severity ?? this.severity,
      estimatedResolution: estimatedResolution ?? this.estimatedResolution,
    );
  }
}

class PipelinesEngine {
  final Map<String, TransitLineHealth> _lineHealth =
      <String, TransitLineHealth>{};
  final Map<String, Duration> _refreshIntervals = <String, Duration>{};
  final Map<String, Timer> _timers = <String, Timer>{};
  final StreamController<TransitLineHealth> _healthUpdates =
      StreamController<TransitLineHealth>.broadcast();
  final Random _random = Random();

  void registerLine(
    String lineId,
    String lineName, {
    Duration refreshInterval = const Duration(minutes: 2),
  }) {
    _refreshIntervals[lineId] = refreshInterval;
    _lineHealth[lineId] = TransitLineHealth(
      lineId: lineId,
      lineName: lineName,
      healthScore: 1.0,
      status: LineStatus.normal,
      degradedSegments: const <DegradedSegment>[],
      lastUpdated: DateTime.now(),
    );
    _scheduleRefresh(lineId, refreshInterval);
  }

  void unregisterLine(String lineId) {
    _timers.remove(lineId)?.cancel();
    _refreshIntervals.remove(lineId);
    _lineHealth.remove(lineId);
  }

  TransitLineHealth? getLineHealth(String lineId) => _lineHealth[lineId];

  List<TransitLineHealth> getAllLineHealth() {
    final values = _lineHealth.values.toList(growable: false);
    values.sort((a, b) => a.lineName.compareTo(b.lineName));
    return values;
  }

  List<TransitLineHealth> getDegradedLines() {
    return _lineHealth.values
        .where((health) => health.healthScore < 0.7)
        .toList(growable: false);
  }

  void updateLineHealth(String lineId, TransitLineHealth health) {
    _lineHealth[lineId] = health.copyWith(lastUpdated: DateTime.now());
    _healthUpdates.add(_lineHealth[lineId]!);
  }

  void addDegradedSegment(String lineId, DegradedSegment segment) {
    final current = _lineHealth[lineId];
    if (current == null) {
      return;
    }
    final updatedSegments = List<DegradedSegment>.from(current.degradedSegments)
      ..removeWhere((existing) => existing.id == segment.id)
      ..add(segment);
    updateLineHealth(
      lineId,
      current.copyWith(
        degradedSegments: updatedSegments,
        healthScore: _computeHealthScore(updatedSegments),
        status: _statusForSegments(updatedSegments),
      ),
    );
  }

  void resolveDegradedSegment(String lineId, String segmentId) {
    final current = _lineHealth[lineId];
    if (current == null) {
      return;
    }
    final updatedSegments = current.degradedSegments
        .where((segment) => segment.id != segmentId)
        .toList(growable: false);
    updateLineHealth(
      lineId,
      current.copyWith(
        degradedSegments: updatedSegments,
        healthScore: _computeHealthScore(updatedSegments),
        status: _statusForSegments(updatedSegments),
      ),
    );
  }

  void _scheduleRefresh(String lineId, Duration interval) {
    _timers.remove(lineId)?.cancel();
    _timers[lineId] = Timer.periodic(interval, (_) => _refreshLine(lineId));
  }

  void _refreshLine(String lineId) {
    final current = _lineHealth[lineId];
    if (current == null) {
      return;
    }

    var updatedSegments = current.degradedSegments.map((segment) {
      final drift = (_random.nextDouble() - 0.5) * 0.12;
      return segment.copyWith(severity: (segment.severity + drift).clamp(0.1, 1.0).toDouble());
    }).toList(growable: true);

    if (updatedSegments.isNotEmpty && _random.nextDouble() < 0.2) {
      updatedSegments.removeAt(_random.nextInt(updatedSegments.length));
    } else if (updatedSegments.isEmpty && _random.nextDouble() < 0.15) {
      updatedSegments.add(
        DegradedSegment(
          id: _uuid.v4(),
          lineId: lineId,
          fromStopId: 'auto-start',
          toStopId: 'auto-end',
          reason: 'Short-turning due to rolling stock balancing',
          severity: 0.28 + (_random.nextDouble() * 0.25),
          estimatedResolution: DateTime.now().add(
            Duration(minutes: 20 + _random.nextInt(40)),
          ),
        ),
      );
    }

    final healthScore = _computeHealthScore(updatedSegments);
    final newStatus = _statusForSegments(updatedSegments, healthScore: healthScore);
    updateLineHealth(
      lineId,
      current.copyWith(
        degradedSegments: updatedSegments,
        healthScore: healthScore,
        status: newStatus,
      ),
    );
  }

  Stream<TransitLineHealth> get healthUpdates => _healthUpdates.stream;

  void dispose() {
    for (final timer in _timers.values) {
      timer.cancel();
    }
    _timers.clear();
    _healthUpdates.close();
  }

  double _computeHealthScore(List<DegradedSegment> segments) {
    if (segments.isEmpty) {
      return 1.0;
    }
    final totalSeverity = segments.fold<double>(0.0, (sum, segment) => sum + segment.severity);
    final penalty = min(0.9, totalSeverity / max(1, segments.length) + (segments.length * 0.08));
    return (1.0 - penalty).clamp(0.0, 1.0).toDouble();
  }

  LineStatus _statusForSegments(
    List<DegradedSegment> segments, {
    double? healthScore,
  }) {
    final score = healthScore ?? _computeHealthScore(segments);
    if (segments.any((segment) => segment.severity >= 0.9)) {
      return LineStatus.suspended;
    }
    if (segments.length >= 3 || score < 0.35) {
      return LineStatus.majorDelays;
    }
    if (segments.length >= 2 || score < 0.55) {
      return LineStatus.partialService;
    }
    if (segments.isNotEmpty || score < 0.85) {
      return LineStatus.minorDelays;
    }
    return LineStatus.normal;
  }
}
