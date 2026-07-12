import 'dart:math' as math;
import '../models/latlng.dart';
import '../models/corridor.dart';

// ─── GeometryService ──────────────────────────────────────────────────────────

/// Static and instance spatial geometry helpers.
///
/// All methods operate on [LatLng] coordinates and return either coordinate
/// lists or scalar measurements in metres.
class GeometryService {
  // ─── Path generation ────────────────────────────────────────────────────────

  /// Great-circle interpolation with [steps] evenly spaced waypoints.
  List<LatLng> interpolatePath(LatLng start, LatLng end, int steps) {
    if (steps < 2) return [start, end];
    return List.generate(steps, (i) {
      final t = i / (steps - 1);
      return LatLng.lerp(start, end, t);
    });
  }

  /// Interpolated path with small random noise on each waypoint.
  ///
  /// [noiseFactor] controls the maximum lat/lng deviation in degrees.
  List<LatLng> interpolatePathWithNoise(
    LatLng start,
    LatLng end,
    int steps, {
    double noiseFactor = 0.00005,
  }) {
    final rng = math.Random();
    final path = interpolatePath(start, end, steps);
    return [
      path.first,
      ...path.sublist(1, path.length - 1).map((p) => LatLng(
            p.latitude + (rng.nextDouble() - 0.5) * 2 * noiseFactor,
            p.longitude + (rng.nextDouble() - 0.5) * 2 * noiseFactor,
          )),
      path.last,
    ];
  }

  // ─── Path simplification ────────────────────────────────────────────────────

  /// Ramer–Douglas–Peucker path simplification.
  ///
  /// [toleranceMeters] is the perpendicular distance threshold.
  List<LatLng> simplifyPath(List<LatLng> path, double toleranceMeters) {
    if (path.length < 3) return path;
    return _rdp(path, toleranceMeters);
  }

  List<LatLng> _rdp(List<LatLng> points, double tolerance) {
    if (points.length < 3) return points;
    double maxDist = 0;
    int maxIdx = 0;
    final start = points.first;
    final end = points.last;
    for (int i = 1; i < points.length - 1; i++) {
      final d = _perpendicularDistance(points[i], start, end);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }
    if (maxDist > tolerance) {
      final left = _rdp(points.sublist(0, maxIdx + 1), tolerance);
      final right = _rdp(points.sublist(maxIdx), tolerance);
      return [...left.sublist(0, left.length - 1), ...right];
    }
    return [start, end];
  }

  double _perpendicularDistance(LatLng p, LatLng a, LatLng b) {
    // Use Cartesian approximation (valid for small distances).
    final dx = b.longitude - a.longitude;
    final dy = b.latitude - a.latitude;
    if (dx == 0 && dy == 0) return p.distanceTo(a);
    final t = ((p.longitude - a.longitude) * dx +
            (p.latitude - a.latitude) * dy) /
        (dx * dx + dy * dy);
    final tc = t.clamp(0.0, 1.0);
    final closest = LatLng(
      a.latitude + tc * dy,
      a.longitude + tc * dx,
    );
    return p.distanceTo(closest);
  }

  // ─── Polygon utilities ───────────────────────────────────────────────────────

  /// Ray-casting point-in-polygon test.
  bool pointInPolygon(LatLng point, List<LatLng> polygon) {
    if (polygon.length < 3) return false;
    bool inside = false;
    int j = polygon.length - 1;
    for (int i = 0; i < polygon.length; i++) {
      final xi = polygon[i].longitude;
      final yi = polygon[i].latitude;
      final xj = polygon[j].longitude;
      final yj = polygon[j].latitude;
      final intersect = ((yi > point.latitude) != (yj > point.latitude)) &&
          (point.longitude <
              (xj - xi) * (point.latitude - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
      j = i;
    }
    return inside;
  }

  /// Shoelace formula for polygon area in square metres (approximate).
  double polygonArea(List<LatLng> polygon) {
    if (polygon.length < 3) return 0;
    double area = 0;
    const degToMetre = 111320.0;
    for (int i = 0; i < polygon.length; i++) {
      final j = (i + 1) % polygon.length;
      final xi = polygon[i].longitude * degToMetre *
          math.cos(polygon[i].latitude * math.pi / 180);
      final yi = polygon[i].latitude * degToMetre;
      final xj = polygon[j].longitude * degToMetre *
          math.cos(polygon[j].latitude * math.pi / 180);
      final yj = polygon[j].latitude * degToMetre;
      area += xi * yj - xj * yi;
    }
    return area.abs() / 2;
  }

  // ─── Path measurements ───────────────────────────────────────────────────────

  /// Total length of [path] in metres (sum of haversine segment distances).
  double pathLength(List<LatLng> path) {
    double total = 0;
    for (int i = 0; i < path.length - 1; i++) {
      total += path[i].distanceTo(path[i + 1]);
    }
    return total;
  }

  /// Returns the nearest point on [path] to [point] and its segment index.
  (int, LatLng) nearestPointOnPath(LatLng point, List<LatLng> path) {
    double minDist = double.infinity;
    int bestIdx = 0;
    LatLng bestPoint = path.first;
    for (int i = 0; i < path.length - 1; i++) {
      final (_, cp) = _closestPointOnSegment(point, path[i], path[i + 1]);
      final d = point.distanceTo(cp);
      if (d < minDist) {
        minDist = d;
        bestIdx = i;
        bestPoint = cp;
      }
    }
    return (bestIdx, bestPoint);
  }

  double distanceToPath(LatLng point, List<LatLng> path) {
    final (_, cp) = nearestPointOnPath(point, path);
    return point.distanceTo(cp);
  }

  (double, LatLng) _closestPointOnSegment(LatLng p, LatLng a, LatLng b) {
    final dx = b.longitude - a.longitude;
    final dy = b.latitude - a.latitude;
    final lenSq = dx * dx + dy * dy;
    if (lenSq == 0) return (0, a);
    final t = (((p.longitude - a.longitude) * dx +
                (p.latitude - a.latitude) * dy) /
            lenSq)
        .clamp(0.0, 1.0);
    return (t, LatLng(a.latitude + t * dy, a.longitude + t * dx));
  }

  // ─── Path buffering ──────────────────────────────────────────────────────────

  /// Returns a closed polygon approximating a [bufferMeters]-wide buffer
  /// around [path] (offset both sides then merge).
  List<LatLng> bufferPath(List<LatLng> path, double bufferMeters) {
    if (path.length < 2) return path;
    final degOffset = bufferMeters / 111320.0;
    final left = <LatLng>[];
    final right = <LatLng>[];
    for (int i = 0; i < path.length - 1; i++) {
      final bearing = path[i].bearingTo(path[i + 1]);
      final perpLeft = (bearing - 90 + 360) % 360;
      final perpRight = (bearing + 90) % 360;
      final lp = _offsetPoint(path[i], perpLeft, degOffset);
      final rp = _offsetPoint(path[i], perpRight, degOffset);
      left.add(lp);
      right.add(rp);
    }
    return [...left, ...right.reversed];
  }

  LatLng _offsetPoint(LatLng p, double bearingDeg, double degOffset) {
    final rad = bearingDeg * math.pi / 180;
    return LatLng(
      p.latitude + degOffset * math.cos(rad),
      p.longitude + degOffset * math.sin(rad),
    );
  }

  // ─── Corridor generation ─────────────────────────────────────────────────────

  /// Builds a [Corridor] from [start] to [end].
  Corridor generateCorridor(
    LatLng start,
    LatLng end, {
    CorridorType type = CorridorType.driving,
    double widthMeters = 3.5,
  }) {
    return Corridor(
      id: 'corridor_${DateTime.now().microsecondsSinceEpoch}',
      type: type,
      path: interpolatePath(start, end, 10),
      widthMeters: widthMeters,
      isAccessible: true,
      isBidirectional: true,
    );
  }

  /// Segments [path] into individual [Corridor] objects.
  List<Corridor> segmentPath(List<LatLng> path, CorridorType type) {
    return List.generate(path.length - 1, (i) {
      return Corridor(
        id: 'seg_${i}_${DateTime.now().microsecondsSinceEpoch}',
        type: type,
        path: [path[i], path[i + 1]],
        isAccessible: true,
        isBidirectional: true,
      );
    });
  }
}
