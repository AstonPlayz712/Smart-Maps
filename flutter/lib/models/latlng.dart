import 'dart:math' as math;

class LatLng {
  const LatLng(this.latitude, this.longitude, {this.altitude});

  final double latitude;
  final double longitude;
  final double? altitude;

  double get lat => latitude;
  double get lng => longitude;

  LatLng copyWith({double? latitude, double? longitude, double? altitude}) {
    return LatLng(
      latitude ?? this.latitude,
      longitude ?? this.longitude,
      altitude: altitude ?? this.altitude,
    );
  }

  double distanceTo(LatLng other) => haversineDistance(other);

  double haversineDistance(LatLng other) {
    const earthRadiusMeters = 6371000.0;
    final dLat = _toRadians(other.latitude - latitude);
    final dLon = _toRadians(other.longitude - longitude);
    final lat1 = _toRadians(latitude);
    final lat2 = _toRadians(other.latitude);

    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(lat1) * math.cos(lat2) * math.sin(dLon / 2) * math.sin(dLon / 2);
    final c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
    return earthRadiusMeters * c;
  }

  double bearingTo(LatLng other) {
    final lat1 = _toRadians(latitude);
    final lat2 = _toRadians(other.latitude);
    final dLon = _toRadians(other.longitude - longitude);
    final y = math.sin(dLon) * math.cos(lat2);
    final x = math.cos(lat1) * math.sin(lat2) -
        math.sin(lat1) * math.cos(lat2) * math.cos(dLon);
    return (_toDegrees(math.atan2(y, x)) + 360) % 360;
  }

  static LatLng lerp(LatLng a, LatLng b, double t) {
    final factor = t.clamp(0.0, 1.0).toDouble();
    return LatLng(
      a.latitude + (b.latitude - a.latitude) * factor,
      a.longitude + (b.longitude - a.longitude) * factor,
      altitude: a.altitude == null && b.altitude == null
          ? null
          : (a.altitude ?? 0) + ((b.altitude ?? 0) - (a.altitude ?? 0)) * factor,
    );
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        other is LatLng &&
            latitude == other.latitude &&
            longitude == other.longitude &&
            altitude == other.altitude;
  }

  @override
  int get hashCode => Object.hash(latitude, longitude, altitude);

  @override
  String toString() => 'LatLng($latitude, $longitude, altitude: $altitude)';

  static double _toRadians(double degrees) => degrees * math.pi / 180.0;
  static double _toDegrees(double radians) => radians * 180.0 / math.pi;
}
