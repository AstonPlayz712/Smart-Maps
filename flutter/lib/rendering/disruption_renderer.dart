import 'dart:async';
import '../models/disruption_node.dart';
import '../models/latlng.dart';

// ─── IncidentRing ─────────────────────────────────────────────────────────────

/// A pulsing visual ring rendered around a disruption incident location.
class IncidentRing {
  final DisruptionNode disruption;
  final double radiusMeters;
  final int colour; // ARGB
  double pulsePhase; // 0.0 – 1.0
  bool isAnimating;

  IncidentRing({
    required this.disruption,
    required this.radiusMeters,
    required this.colour,
    this.pulsePhase = 0.0,
    this.isAnimating = false,
  });
}

// ─── DisruptionRenderer ───────────────────────────────────────────────────────

/// Renders incident rings and disruption overlays on the map.
///
/// Each [DisruptionNode] gets a pulsing ring whose size and colour scale with
/// its [DisruptionSeverity].  Rings pulse continuously when animation is
/// running.
class DisruptionRenderer {
  final Map<String, IncidentRing> _rings = {};
  Timer? _animationTimer;

  // ─── Disruption management ───────────────────────────────────────────────────

  void addDisruption(DisruptionNode disruption) {
    _rings[disruption.id] = IncidentRing(
      disruption: disruption,
      radiusMeters: _severityRadius(disruption.severity),
      colour: _severityColour(disruption.severity),
      isAnimating: _animationTimer != null,
    );
  }

  void updateDisruption(DisruptionNode disruption) {
    final existing = _rings[disruption.id];
    if (existing == null) {
      addDisruption(disruption);
      return;
    }
    _rings[disruption.id] = IncidentRing(
      disruption: disruption,
      radiusMeters: _severityRadius(disruption.severity),
      colour: _severityColour(disruption.severity),
      pulsePhase: existing.pulsePhase,
      isAnimating: existing.isAnimating,
    );
  }

  void removeDisruption(String id) => _rings.remove(id);

  void clearAll() => _rings.clear();

  List<IncidentRing> get activeRings => _rings.values.toList();

  // ─── Pulse animation ─────────────────────────────────────────────────────────

  /// Start a periodic timer that advances each ring's pulse phase by a fixed
  /// step.  The UI layer reads [activeRings] on each tick to redraw.
  void startPulseAnimation({
    Duration interval = const Duration(milliseconds: 50),
  }) {
    if (_animationTimer != null) return;
    _animationTimer = Timer.periodic(interval, (_) {
      const step = 0.03;
      for (final ring in _rings.values) {
        ring.pulsePhase = (ring.pulsePhase + step) % 1.0;
        ring.isAnimating = true;
      }
    });
  }

  void stopPulseAnimation() {
    _animationTimer?.cancel();
    _animationTimer = null;
    for (final ring in _rings.values) {
      ring.isAnimating = false;
    }
  }

  void dispose() {
    stopPulseAnimation();
  }

  // ─── Severity mapping ────────────────────────────────────────────────────────

  /// ARGB colour per [DisruptionSeverity].
  int _severityColour(DisruptionSeverity severity) {
    switch (severity) {
      case DisruptionSeverity.low:
        return 0xFFFFEB3B; // Yellow
      case DisruptionSeverity.medium:
        return 0xFFFF9800; // Orange
      case DisruptionSeverity.high:
        return 0xFFF44336; // Red
      case DisruptionSeverity.critical:
        return 0xFF7B1FA2; // Purple
    }
  }

  /// Ring radius in metres per [DisruptionSeverity].
  double _severityRadius(DisruptionSeverity severity) {
    switch (severity) {
      case DisruptionSeverity.low:
        return 50.0;
      case DisruptionSeverity.medium:
        return 100.0;
      case DisruptionSeverity.high:
        return 200.0;
      case DisruptionSeverity.critical:
        return 350.0;
    }
  }
}
