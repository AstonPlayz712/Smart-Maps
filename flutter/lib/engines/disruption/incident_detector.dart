import 'dart:async';
import 'dart:math' as math;

import '../../models/disruption_node.dart';
import '../../models/latlng.dart';
import '../../models/route_filament.dart';

class IncidentDetector {
  final Duration _refreshInterval;
  Timer? _timer;
  void Function(DisruptionNode)? _onIncidentDetected;
  final Set<String> _knownIncidentIds = <String>{};
  final List<DisruptionNode> _injectedIncidents = <DisruptionNode>[];
  RouteFilament? _currentFilament;

  IncidentDetector({Duration refreshInterval = const Duration(seconds: 30)})
      : _refreshInterval = refreshInterval;

  void start(RouteFilament filament, void Function(DisruptionNode) onDetected) {
    stop();
    _currentFilament = filament;
    _onIncidentDetected = onDetected;
    _scan();
    _timer = Timer.periodic(_refreshInterval, (_) => _scan());
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
    _currentFilament = null;
    _onIncidentDetected = null;
  }

  void injectIncident(DisruptionNode node) {
    _injectedIncidents.removeWhere((incident) => incident.id == node.id);
    _injectedIncidents.add(node);
    _scan();
  }

  bool _overlapsRoute(DisruptionNode node, RouteFilament filament) {
    return _distanceToPath(node.coordinate, filament.path) <= 100.0;
  }

  double _distanceToPath(LatLng point, List<LatLng> path) {
    if (path.isEmpty) {
      return double.infinity;
    }
    if (path.length == 1) {
      return point.distanceTo(path.first);
    }

    var minDistance = double.infinity;
    for (var i = 0; i < path.length - 1; i++) {
      final distance = _distanceToSegment(point, path[i], path[i + 1]);
      if (distance < minDistance) {
        minDistance = distance;
      }
    }
    return minDistance;
  }

  void dispose() {
    stop();
    _injectedIncidents.clear();
    _knownIncidentIds.clear();
  }

  void _scan() {
    final filament = _currentFilament;
    final callback = _onIncidentDetected;
    if (filament == null || callback == null) {
      return;
    }
    for (final node in _injectedIncidents) {
      if (_knownIncidentIds.contains(node.id)) {
        continue;
      }
      if (_overlapsRoute(node, filament)) {
        _knownIncidentIds.add(node.id);
        callback(node);
      }
    }
  }

  double _distanceToSegment(LatLng point, LatLng start, LatLng end) {
    const metersPerDegreeLat = 111320.0;
    final meanLatRadians = ((start.latitude + end.latitude + point.latitude) / 3.0) *
        math.pi /
        180.0;
    final metersPerDegreeLon = metersPerDegreeLat * math.cos(meanLatRadians);

    final px = point.longitude * metersPerDegreeLon;
    final py = point.latitude * metersPerDegreeLat;
    final sx = start.longitude * metersPerDegreeLon;
    final sy = start.latitude * metersPerDegreeLat;
    final ex = end.longitude * metersPerDegreeLon;
    final ey = end.latitude * metersPerDegreeLat;

    final dx = ex - sx;
    final dy = ey - sy;
    if (dx == 0.0 && dy == 0.0) {
      return math.sqrt(math.pow(px - sx, 2) + math.pow(py - sy, 2));
    }

    final t = (((px - sx) * dx) + ((py - sy) * dy)) / (dx * dx + dy * dy);
    final clampedT = t.clamp(0.0, 1.0).toDouble();
    final closestX = sx + dx * clampedT;
    final closestY = sy + dy * clampedT;
    return math.sqrt(
      math.pow(px - closestX, 2) + math.pow(py - closestY, 2),
    );
  }
}
