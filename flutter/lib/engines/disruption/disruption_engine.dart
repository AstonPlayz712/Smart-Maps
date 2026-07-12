import 'dart:async';
import 'dart:math' as math;

import '../../models/disruption_node.dart';
import '../../models/latlng.dart';
import '../../models/route_filament.dart';

sealed class DisruptionEvent {
  const DisruptionEvent();
}

final class DisruptionDetected extends DisruptionEvent {
  final DisruptionNode disruption;
  final RouteFilament alternate;
  final DateTime vetoEndsAt;

  const DisruptionDetected({
    required this.disruption,
    required this.alternate,
    required this.vetoEndsAt,
  });
}

final class DisruptionVetoed extends DisruptionEvent {
  final DisruptionNode disruption;

  const DisruptionVetoed({required this.disruption});
}

final class DisruptionCommitted extends DisruptionEvent {
  final RouteFilament newFilament;

  const DisruptionCommitted({required this.newFilament});
}

final class DisruptionCleared extends DisruptionEvent {
  final String id;

  const DisruptionCleared({required this.id});
}

class DisruptionEngine {
  final List<DisruptionNode> _knownDisruptions = [];
  final Duration _vetoWindow = const Duration(seconds: 8);
  DisruptionNode? _activeDisruption;
  RouteFilament? _proposedAlternate;
  Timer? _vetoTimer;
  bool _isVetoed = false;
  final StreamController<DisruptionEvent> _events =
      StreamController<DisruptionEvent>.broadcast();

  void addDisruption(DisruptionNode node) {
    _knownDisruptions.removeWhere((existing) => existing.id == node.id);
    _knownDisruptions.add(node);
  }

  void removeDisruption(String id) {
    _knownDisruptions.removeWhere((node) => node.id == id);
    if (_activeDisruption?.id == id) {
      clearDisruption(id);
    }
  }

  List<DisruptionNode> getDisruptionsOnRoute(RouteFilament filament) {
    return _knownDisruptions.where((node) {
      final threshold = math.max(100.0, node.radiusMeters);
      return _distanceToPath(node.coordinate, filament.path) <= threshold;
    }).toList(growable: false);
  }

  void detectAndPropose(
    DisruptionNode disruption,
    RouteFilament proposedAlternate,
  ) {
    _vetoTimer?.cancel();
    _activeDisruption = disruption;
    _proposedAlternate = proposedAlternate;
    _isVetoed = false;
    final vetoEndsAt = DateTime.now().add(_vetoWindow);
    _events.add(
      DisruptionDetected(
        disruption: disruption,
        alternate: proposedAlternate,
        vetoEndsAt: vetoEndsAt,
      ),
    );
    _vetoTimer = Timer(_vetoWindow, () {
      if (!_isVetoed) {
        commitReroute();
      }
    });
  }

  void veto() {
    final disruption = _activeDisruption;
    if (disruption == null) {
      return;
    }
    _vetoTimer?.cancel();
    _vetoTimer = null;
    _isVetoed = true;
    _proposedAlternate = null;
    _events.add(DisruptionVetoed(disruption: disruption));
  }

  void commitReroute() {
    final newFilament = _proposedAlternate;
    if (newFilament == null) {
      return;
    }
    _vetoTimer?.cancel();
    _vetoTimer = null;
    _events.add(DisruptionCommitted(newFilament: newFilament));
    _activeDisruption = null;
    _proposedAlternate = null;
    _isVetoed = false;
  }

  void clearDisruption(String id) {
    _knownDisruptions.removeWhere((node) => node.id == id);
    if (_activeDisruption?.id == id) {
      _vetoTimer?.cancel();
      _vetoTimer = null;
      _activeDisruption = null;
      _proposedAlternate = null;
      _isVetoed = false;
    }
    _events.add(DisruptionCleared(id: id));
  }

  bool get hasActiveDisruption => _activeDisruption != null;

  Stream<DisruptionEvent> get events => _events.stream;

  void dispose() {
    _vetoTimer?.cancel();
    _events.close();
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
