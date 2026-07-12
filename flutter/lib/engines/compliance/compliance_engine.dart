import 'dart:math';

import '../../models/compliance_zone.dart';
import '../../models/latlng.dart';
import '../../models/mode_strand.dart';
import '../../models/route_filament.dart';

class ComplianceViolation {
  const ComplianceViolation({
    required this.zoneId,
    required this.mode,
    required this.type,
    required this.detectedAt,
    required this.message,
    this.speedExcessMps,
  });

  final String zoneId;
  final TravelMode mode;
  final ComplianceZoneType type;
  final DateTime detectedAt;
  final double? speedExcessMps;
  final String message;
}

class ComplianceEngine {
  final List<ComplianceZone> _zones = <ComplianceZone>[];
  final Map<String, ComplianceViolation> _activeViolations =
      <String, ComplianceViolation>{};

  void loadZones(List<ComplianceZone> zones) {
    _zones
      ..clear()
      ..addAll(zones);
    clearViolations();
  }

  void addZone(ComplianceZone zone) {
    _zones.removeWhere((existing) => existing.id == zone.id);
    _zones.add(zone);
  }

  void removeZone(String id) {
    _zones.removeWhere((zone) => zone.id == id);
    _activeViolations.remove(id);
  }

  List<ComplianceZone> getActiveZones(LatLng position) {
    final now = DateTime.now();
    return _zones
        .where((zone) => zone.isActiveAt(now) && _contains(zone.polygon, position))
        .toList(growable: false);
  }

  List<ComplianceZone> getZonesForMode(TravelMode mode) {
    final now = DateTime.now();
    return _zones
        .where((zone) => zone.isActiveAt(now) && zone.appliesToMode(mode))
        .toList(growable: false);
  }

  ComplianceViolation? checkViolation(
    LatLng position,
    TravelMode mode,
    double speedMps,
  ) {
    for (final zone in getActiveZones(position)) {
      if (!zone.appliesToMode(mode)) {
        continue;
      }
      final violation = _buildViolation(zone, mode, speedMps);
      if (violation != null) {
        _activeViolations[zone.id] = violation;
        return violation;
      }
    }
    return null;
  }

  bool isPositionCompliant(LatLng position, TravelMode mode, double speedMps) {
    return checkViolation(position, mode, speedMps) == null;
  }

  bool isRouteCompliant(RouteFilament filament) {
    final averageSpeed = filament.durationSec != null && filament.durationSec! > 0
        ? filament.computedDistanceMeters / filament.durationSec!
        : 0.0;
    for (final zone in getZonesOnRoute(filament)) {
      if (_buildViolation(zone, filament.mode, averageSpeed) != null) {
        return false;
      }
    }
    return true;
  }

  List<ComplianceZone> getZonesOnRoute(RouteFilament filament) {
    final now = DateTime.now();
    return _zones.where((zone) {
      if (!zone.isActiveAt(now)) {
        return false;
      }
      for (final point in filament.path) {
        if (_contains(zone.polygon, point)) {
          return true;
        }
      }
      for (var i = 1; i < filament.path.length; i++) {
        if (_segmentIntersectsPolygon(
          filament.path[i - 1],
          filament.path[i],
          zone.polygon,
        )) {
          return true;
        }
      }
      return false;
    }).toList(growable: false);
  }

  double? getSpeedLimit(LatLng position) {
    final speedLimits = getActiveZones(position)
        .map((zone) => zone.speedLimitMps)
        .whereType<double>()
        .toList(growable: false);
    if (speedLimits.isEmpty) {
      return null;
    }
    return speedLimits.reduce(min);
  }

  void resolveViolation(String zoneId) {
    _activeViolations.remove(zoneId);
  }

  List<ComplianceViolation> get currentViolations {
    final violations = _activeViolations.values.toList(growable: false);
    violations.sort((a, b) => b.detectedAt.compareTo(a.detectedAt));
    return violations;
  }

  void clearViolations() {
    _activeViolations.clear();
  }

  ComplianceViolation? _buildViolation(
    ComplianceZone zone,
    TravelMode mode,
    double speedMps,
  ) {
    switch (zone.type) {
      case ComplianceZoneType.lez:
        if (mode == TravelMode.drive) {
          return _createViolation(
            zone,
            mode,
            'Driving is restricted in this low-emission zone.',
          );
        }
        return null;
      case ComplianceZoneType.slowZone:
        if (zone.speedLimitMps != null && speedMps > zone.speedLimitMps!) {
          return _createViolation(
            zone,
            mode,
            'Speed exceeds slow-zone limit of ${zone.speedLimitMps!.toStringAsFixed(1)} m/s.',
            speedExcessMps: speedMps - zone.speedLimitMps!,
          );
        }
        return null;
      case ComplianceZoneType.noRideZone:
        if (mode == TravelMode.microMobility || mode == TravelMode.cycle) {
          return _createViolation(
            zone,
            mode,
            'Riding is not permitted in this zone.',
          );
        }
        return null;
      case ComplianceZoneType.autoLimitSpeed:
        if (zone.speedLimitMps != null && speedMps > zone.speedLimitMps!) {
          return _createViolation(
            zone,
            mode,
            'Automatic speed limit exceeded (${zone.speedLimitMps!.toStringAsFixed(1)} m/s).',
            speedExcessMps: speedMps - zone.speedLimitMps!,
          );
        }
        return null;
      case ComplianceZoneType.legalBay:
        // Legal bays are informational — no violation generated.
        return null;
      case ComplianceZoneType.microMobilityGeofence:
        if (mode == TravelMode.microMobility) {
          return _createViolation(
            zone,
            mode,
            'Micro-mobility is restricted in this geofenced area.',
          );
        }
        return null;
      case ComplianceZoneType.congestionCharge:
        if (mode == TravelMode.drive) {
          return _createViolation(
            zone,
            mode,
            'Congestion charge applies in this zone.',
          );
        }
        return null;
    }
  }

  ComplianceViolation _createViolation(
    ComplianceZone zone,
    TravelMode mode,
    String message, {
    double? speedExcessMps,
  }) {
    return ComplianceViolation(
      zoneId: zone.id,
      mode: mode,
      type: zone.type,
      detectedAt: DateTime.now(),
      speedExcessMps: speedExcessMps,
      message: message,
    );
  }

  bool _contains(List<LatLng> polygon, LatLng point) {
    if (polygon.length < 3) {
      return false;
    }
    var inside = false;
    for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      final xi = polygon[i].longitude;
      final yi = polygon[i].latitude;
      final xj = polygon[j].longitude;
      final yj = polygon[j].latitude;
      final intersect = ((yi > point.latitude) != (yj > point.latitude)) &&
          (point.longitude <
              ((xj - xi) * (point.latitude - yi) / ((yj - yi) == 0 ? 1e-12 : (yj - yi))) +
                  xi);
      if (intersect) {
        inside = !inside;
      }
    }
    return inside;
  }

  bool _segmentIntersectsPolygon(
    LatLng start,
    LatLng end,
    List<LatLng> polygon,
  ) {
    if (_contains(polygon, start) || _contains(polygon, end)) {
      return true;
    }
    for (var i = 0; i < polygon.length; i++) {
      final next = polygon[(i + 1) % polygon.length];
      if (_segmentsIntersect(start, end, polygon[i], next)) {
        return true;
      }
    }
    return false;
  }

  bool _segmentsIntersect(LatLng a, LatLng b, LatLng c, LatLng d) {
    double orientation(LatLng p, LatLng q, LatLng r) {
      return (q.longitude - p.longitude) * (r.latitude - q.latitude) -
          (q.latitude - p.latitude) * (r.longitude - q.longitude);
    }

    bool onSegment(LatLng p, LatLng q, LatLng r) {
      return q.longitude <= max(p.longitude, r.longitude) &&
          q.longitude >= min(p.longitude, r.longitude) &&
          q.latitude <= max(p.latitude, r.latitude) &&
          q.latitude >= min(p.latitude, r.latitude);
    }

    final o1 = orientation(a, b, c);
    final o2 = orientation(a, b, d);
    final o3 = orientation(c, d, a);
    final o4 = orientation(c, d, b);

    if (o1 == 0 && onSegment(a, c, b)) return true;
    if (o2 == 0 && onSegment(a, d, b)) return true;
    if (o3 == 0 && onSegment(c, a, d)) return true;
    if (o4 == 0 && onSegment(c, b, d)) return true;

    return (o1 > 0) != (o2 > 0) && (o3 > 0) != (o4 > 0);
  }
}
