import 'dart:math' as math;
import '../models/gate.dart';
import '../models/latlng.dart';
import '../models/camera_pose.dart';
import '../models/mode_strand.dart';

// ─── INCalloutOverlay ─────────────────────────────────────────────────────────

/// A world-anchored text annotation for IN rendering.
class INCalloutOverlay {
  final String id;
  final String text;
  final LatLng coordinate;
  final double opacity;

  const INCalloutOverlay({
    required this.id,
    required this.text,
    required this.coordinate,
    this.opacity = 1.0,
  });
}

// ─── GateGeometry ─────────────────────────────────────────────────────────────

/// Pre-computed render geometry for a junction gate.
class GateGeometry {
  final Gate gate;
  final List<LatLng> approachPath;
  final List<LatLng> exitPath;
  final List<LatLng> turnArcPath;
  final int colour; // ARGB

  const GateGeometry({
    required this.gate,
    required this.approachPath,
    required this.exitPath,
    required this.turnArcPath,
    required this.colour,
  });
}

// ─── INRenderer ───────────────────────────────────────────────────────────────

/// Manages IN-specific rendering: camera pitch, gate geometry, world callouts.
class INRenderer {
  bool _isActive = false;
  final List<GateGeometry> _gateGeometries = [];
  final List<INCalloutOverlay> _calloutOverlays = [];
  CameraPose? _currentCameraPose;

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  void activate() => _isActive = true;

  void deactivate() {
    _isActive = false;
    _gateGeometries.clear();
    _calloutOverlays.clear();
  }

  bool get isActive => _isActive;

  // ─── Camera ──────────────────────────────────────────────────────────────────

  void updateCameraPose(CameraPose pose) => _currentCameraPose = pose;

  CameraPose? get currentCameraPose => _currentCameraPose;

  // ─── Gate rendering ──────────────────────────────────────────────────────────

  void renderGate(Gate gate) {
    // Remove existing geometry for this gate if already present.
    _gateGeometries.removeWhere((g) => g.gate.id == gate.id);
    _gateGeometries.add(buildGateGeometry(gate));
  }

  void clearGates() => _gateGeometries.clear();

  GateGeometry buildGateGeometry(Gate gate) {
    const approachLen = 0.0003; // ~33m in degrees
    const exitLen = 0.0003;

    // Approach path: 5 points leading into the entry coordinate.
    final approachBearingRad = gate.approachBearing * math.pi / 180;
    final approachPath = List.generate(5, (i) {
      final t = (4 - i) / 4.0;
      return LatLng(
        gate.entryCoordinate.latitude -
            t * approachLen * math.cos(approachBearingRad),
        gate.entryCoordinate.longitude -
            t * approachLen * math.sin(approachBearingRad),
      );
    });

    // Exit path: 5 points from exit coordinate onwards.
    final exitBearingRad = gate.exitBearing * math.pi / 180;
    final exitPath = List.generate(5, (i) {
      final t = i / 4.0;
      return LatLng(
        gate.exitCoordinate.latitude +
            t * exitLen * math.cos(exitBearingRad),
        gate.exitCoordinate.longitude +
            t * exitLen * math.sin(exitBearingRad),
      );
    });

    final turnArcPath = _buildTurnArc(gate);

    return GateGeometry(
      gate: gate,
      approachPath: approachPath,
      exitPath: exitPath,
      turnArcPath: turnArcPath,
      colour: gate.isComplex ? 0xFFFF6F00 : 0xFF1565C0,
    );
  }

  /// Generate arc points between [gate.entryCoordinate] and
  /// [gate.exitCoordinate] as a smooth turn path.
  List<LatLng> _buildTurnArc(Gate gate, {int steps = 12}) {
    return List.generate(steps + 1, (i) {
      final t = i / steps;
      // Simple linear interpolation with a slight perpendicular offset to
      // simulate a curved turn.
      final base = LatLng.lerp(
        gate.entryCoordinate,
        gate.exitCoordinate,
        t,
      );
      // Perpendicular offset proportional to sin curve (bulge at midpoint).
      final bulge = math.sin(t * math.pi) * 0.00005;
      final perpBearing =
          (gate.approachBearing + 90 * gate.turnAngle.sign + 360) % 360;
      final perpRad = perpBearing * math.pi / 180;
      return LatLng(
        base.latitude + bulge * math.cos(perpRad),
        base.longitude + bulge * math.sin(perpRad),
      );
    });
  }

  // ─── Callouts ────────────────────────────────────────────────────────────────

  void updateCallouts(List<INCalloutOverlay> callouts) {
    _calloutOverlays
      ..clear()
      ..addAll(callouts);
  }

  void clearCallouts() => _calloutOverlays.clear();

  // ─── Accessors ───────────────────────────────────────────────────────────────

  List<GateGeometry> get activeGates => List.unmodifiable(_gateGeometries);

  List<INCalloutOverlay> get activeCallouts =>
      List.unmodifiable(_calloutOverlays);
}
