import 'dart:math';

import '../models/latlng.dart';

class GeoUtils {
  static const double earthRadiusMeters = 6371000.0;

  static double haversineMeters(LatLng a, LatLng b) {
    final lat1 = _degToRad(a.lat);
    final lat2 = _degToRad(b.lat);
    final dLat = lat2 - lat1;
    final dLng = _degToRad(b.lng - a.lng);

    final hav = (pow(sin(dLat / 2), 2) +
            cos(lat1) * cos(lat2) * pow(sin(dLng / 2), 2))
        .toDouble();
    final c = 2 * atan2(sqrt(hav), sqrt(1 - hav));
    return earthRadiusMeters * c;
  }

  static double bearingDegrees(LatLng from, LatLng to) {
    final lat1 = _degToRad(from.lat);
    final lat2 = _degToRad(to.lat);
    final dLng = _degToRad(to.lng - from.lng);

    final y = sin(dLng) * cos(lat2);
    final x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLng);
    return normalizeBearing(_radToDeg(atan2(y, x)));
  }

  static double normalizeBearing(double bearing) {
    final normalized = bearing % 360;
    return normalized < 0 ? normalized + 360 : normalized;
  }

  static double signedTurnAngle(double beforeDeg, double afterDeg) {
    var delta = normalizeBearing(afterDeg) - normalizeBearing(beforeDeg);
    if (delta > 180) {
      delta -= 360;
    } else if (delta < -180) {
      delta += 360;
    }
    return delta;
  }

  static LatLng offsetPoint(
    LatLng origin, {
    required double distanceMeters,
    required double bearingDeg,
  }) {
    if (distanceMeters == 0) {
      return origin;
    }

    final angularDistance = distanceMeters / earthRadiusMeters;
    final bearing = _degToRad(bearingDeg);
    final lat1 = _degToRad(origin.lat);
    final lng1 = _degToRad(origin.lng);

    final lat2 = asin(
      sin(lat1) * cos(angularDistance) +
          cos(lat1) * sin(angularDistance) * cos(bearing),
    );
    final lng2 = lng1 +
        atan2(
          sin(bearing) * sin(angularDistance) * cos(lat1),
          cos(angularDistance) - sin(lat1) * sin(lat2),
        );

    return LatLng(_radToDeg(lat2), _radToDeg(lng2));
  }

  static LatLng interpolateGreatCircle(LatLng from, LatLng to, double t) {
    if (t <= 0) {
      return from;
    }
    if (t >= 1) {
      return to;
    }

    final lat1 = _degToRad(from.lat);
    final lng1 = _degToRad(from.lng);
    final lat2 = _degToRad(to.lat);
    final lng2 = _degToRad(to.lng);

    final angularDistance = haversineMeters(from, to) / earthRadiusMeters;
    if (angularDistance == 0) {
      return from;
    }

    final sinTotal = sin(angularDistance);
    final a = sin((1 - t) * angularDistance) / sinTotal;
    final b = sin(t * angularDistance) / sinTotal;

    final x = a * cos(lat1) * cos(lng1) + b * cos(lat2) * cos(lng2);
    final y = a * cos(lat1) * sin(lng1) + b * cos(lat2) * sin(lng2);
    final z = a * sin(lat1) + b * sin(lat2);

    final lat = atan2(z, sqrt(x * x + y * y));
    final lng = atan2(y, x);
    return LatLng(_radToDeg(lat), _radToDeg(lng));
  }

  static List<LatLng> samplePath(
    LatLng origin,
    LatLng destination, {
    required int waypointCount,
    double noiseMeters = 0,
    int seed = 0,
  }) {
    if (waypointCount <= 2) {
      return [origin, destination];
    }

    final random = Random(seed);
    final baseBearing = bearingDegrees(origin, destination);
    final routeDistance = haversineMeters(origin, destination);
    final undulationCycles = 1.5 + random.nextDouble() * 1.5;
    final amplitude = min(noiseMeters, max(0.0, routeDistance * 0.015));
    final points = <LatLng>[];

    for (var i = 0; i < waypointCount; i++) {
      final t = i / (waypointCount - 1);
      var point = interpolateGreatCircle(origin, destination, t);

      if (i != 0 && i != waypointCount - 1 && amplitude > 0) {
        final phase = t * pi * 2 * undulationCycles;
        final wobble = sin(phase) * amplitude;
        final randomJitter = (random.nextDouble() - 0.5) * amplitude * 0.35;
        point = offsetPoint(
          point,
          distanceMeters: wobble + randomJitter,
          bearingDeg: baseBearing + 90,
        );
      }

      points.add(point);
    }

    points[0] = origin;
    points[points.length - 1] = destination;
    return points;
  }

  static double polylineDistanceMeters(List<LatLng> path) {
    var distance = 0.0;
    for (var i = 1; i < path.length; i++) {
      distance += haversineMeters(path[i - 1], path[i]);
    }
    return distance;
  }

  static List<double> cumulativeDistances(List<LatLng> path) {
    final distances = <double>[0];
    var total = 0.0;
    for (var i = 1; i < path.length; i++) {
      total += haversineMeters(path[i - 1], path[i]);
      distances.add(total);
    }
    return distances;
  }

  static bool pointInPolygon(LatLng point, List<LatLng> polygon) {
    if (polygon.length < 3) {
      return false;
    }

    var inside = false;
    for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      final xi = polygon[i].lng;
      final yi = polygon[i].lat;
      final xj = polygon[j].lng;
      final yj = polygon[j].lat;

      final intersects = ((yi > point.lat) != (yj > point.lat)) &&
          (point.lng <
              (xj - xi) * (point.lat - yi) / ((yj - yi) == 0 ? 1e-12 : (yj - yi)) +
                  xi);
      if (intersects) {
        inside = !inside;
      }
    }
    return inside;
  }

  static ({int index, double progressMeters, LatLng point}) nearestPointOnPath(
    LatLng position,
    List<LatLng> path,
  ) {
    if (path.isEmpty) {
      return (index: 0, progressMeters: 0.0, point: position);
    }
    if (path.length == 1) {
      return (index: 0, progressMeters: 0.0, point: path.first);
    }

    final cumulative = cumulativeDistances(path);
    final originLatRad = _degToRad(position.lat);
    final metersPerDegLat = 111320.0;
    final metersPerDegLng = cos(originLatRad) * 111320.0;

    double toX(double lng) => (lng - position.lng) * metersPerDegLng;
    double toY(double lat) => (lat - position.lat) * metersPerDegLat;

    var bestDistanceSq = double.infinity;
    var bestIndex = 0;
    var bestProgress = 0.0;
    var bestPoint = path.first;

    for (var i = 0; i < path.length - 1; i++) {
      final a = path[i];
      final b = path[i + 1];
      final ax = toX(a.lng);
      final ay = toY(a.lat);
      final bx = toX(b.lng);
      final by = toY(b.lat);
      final dx = bx - ax;
      final dy = by - ay;
      final lengthSq = dx * dx + dy * dy;
      final t = lengthSq == 0
          ? 0.0
          : (-(ax * dx + ay * dy) / lengthSq).clamp(0.0, 1.0).toDouble();
      final px = ax + dx * t;
      final py = ay + dy * t;
      final distanceSq = px * px + py * py;

      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        final projected = LatLng(
          position.lat + py / metersPerDegLat,
          position.lng + px / (metersPerDegLng == 0 ? 1e-12 : metersPerDegLng),
        );
        bestPoint = projected;
        bestIndex = i + (t >= 0.5 ? 1 : 0);
        bestProgress = cumulative[i] + haversineMeters(a, projected);
      }
    }

    return (index: bestIndex, progressMeters: bestProgress, point: bestPoint);
  }

  static List<LatLng> concatenatePaths(List<List<LatLng>> segments) {
    final combined = <LatLng>[];
    for (final segment in segments) {
      if (segment.isEmpty) {
        continue;
      }
      if (combined.isEmpty) {
        combined.addAll(segment);
        continue;
      }
      if (combined.last == segment.first) {
        combined.addAll(segment.skip(1));
      } else {
        combined.addAll(segment);
      }
    }
    return combined;
  }

  static int seedFromPoints(LatLng a, LatLng b, [int salt = 0]) {
    return Object.hash(a.lat, a.lng, b.lat, b.lng, salt) & 0x7fffffff;
  }

  static double _degToRad(double degrees) => degrees * pi / 180.0;

  static double _radToDeg(double radians) => radians * 180.0 / pi;
}
