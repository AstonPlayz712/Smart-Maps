import 'latlng.dart';
import 'mode_strand.dart';

/// Turn geometry at a junction, used by the Immersive Navigation (IN) engine
/// for camera framing, lane guidance callouts, and arc rendering.
class Gate {
  const Gate({
    required this.id,
    required this.entryCoordinate,
    required this.exitCoordinate,
    required this.approachBearing,
    required this.exitBearing,
    required this.turnAngle,
    required this.maneuverType,
    required this.distanceToGateMeters,
    this.isComplex = false,
    this.laneGuidance,
    this.calloutText,
  });

  final String id;

  /// Point at which the user enters the junction.
  final LatLng entryCoordinate;

  /// Point at which the user exits the junction.
  final LatLng exitCoordinate;

  /// Approach heading in degrees (0–360).
  final double approachBearing;

  /// Exit heading after the turn in degrees (0–360).
  final double exitBearing;

  /// Signed turn angle in degrees (–180 to 180).
  /// Negative = left, positive = right.
  final double turnAngle;

  final ManeuverType maneuverType;
  final double distanceToGateMeters;

  /// True when IN camera should auto-enter for this junction.
  final bool isComplex;

  final LaneGuidance? laneGuidance;

  /// Optional world-anchored callout text for the IN overlay.
  final String? calloutText;

  /// Convenience alias matching older usage.
  LatLng get coordinate => entryCoordinate;
}
