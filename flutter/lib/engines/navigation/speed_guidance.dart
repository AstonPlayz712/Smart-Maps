import '../../models/compliance_zone.dart';
import '../../models/latlng.dart';
import '../geo_utils.dart';

enum SpeedSeverity {
  mild,
  moderate,
  severe,
}

class SpeedAlert {
  final double currentSpeedMps;
  final double limitMps;
  final bool isOverLimit;
  final double excess;
  final SpeedSeverity severity;

  const SpeedAlert({
    required this.currentSpeedMps,
    required this.limitMps,
    required this.isOverLimit,
    required this.excess,
    required this.severity,
  });
}

class SpeedGuidance {
  SpeedAlert? checkSpeed(
    double currentSpeedMps,
    double? limitMps,
    ComplianceZone? activeZone,
  ) {
    final effectiveLimit = activeZone?.speedLimitMps ?? limitMps;
    if (effectiveLimit == null || effectiveLimit <= 0) {
      return null;
    }

    final excess = currentSpeedMps - effectiveLimit;
    final isOverLimit = excess > 0;
    final ratio = isOverLimit ? excess / effectiveLimit : 0.0;
    final severity = ratio >= 0.25
        ? SpeedSeverity.severe
        : ratio >= 0.1
            ? SpeedSeverity.moderate
            : SpeedSeverity.mild;

    return SpeedAlert(
      currentSpeedMps: currentSpeedMps,
      limitMps: effectiveLimit,
      isOverLimit: isOverLimit,
      excess: excess > 0 ? excess : 0,
      severity: severity,
    );
  }

  double? getZoneLimit(LatLng position, List<ComplianceZone> zones) {
    for (final zone in zones) {
      if (GeoUtils.pointInPolygon(position, zone.polygon)) {
        return zone.speedLimitMps;
      }
    }
    return null;
  }

  bool isInSpeedZone(LatLng position, List<ComplianceZone> zones) {
    return getZoneLimit(position, zones) != null;
  }
}
