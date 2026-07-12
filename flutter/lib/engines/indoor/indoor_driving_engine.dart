import 'dart:async';
import 'dart:math';

import '../../models/corridor.dart';
import '../../models/latlng.dart';

class IndoorMap {
  const IndoorMap({
    required this.buildingId,
    required this.floors,
    required this.entrances,
    required this.exits,
  });

  final String buildingId;
  final List<IndoorFloor> floors;
  final List<LatLng> entrances;
  final List<LatLng> exits;
}

class IndoorFloor {
  const IndoorFloor({
    required this.floorLevel,
    required this.corridors,
    required this.doors,
    required this.bounds,
    this.name,
  });

  final int floorLevel;
  final List<Corridor> corridors;
  final List<DoorNode> doors;
  final List<LatLng> bounds;
  final String? name;
}

class IndoorDrivingEngine {
  final Map<String, IndoorMap> _maps = <String, IndoorMap>{};
  String? _activeBuilding;
  int _activeFloor = 0;
  LatLng? _currentPosition;

  void registerBuilding(IndoorMap map) {
    _maps[map.buildingId] = map;
  }

  void enterBuilding(String buildingId, LatLng entryPoint) {
    final map = _maps[buildingId];
    if (map == null) {
      return;
    }
    final nearestEntrance = map.entrances.isEmpty
        ? entryPoint
        : map.entrances.reduce(
            (a, b) => a.distanceTo(entryPoint) <= b.distanceTo(entryPoint) ? a : b,
          );
    _activeBuilding = buildingId;
    _currentPosition = nearestEntrance;
    _activeFloor = detectFloor(entryPoint.altitude ?? 0.0) ??
        (map.floors.isEmpty ? 0 : map.floors.first.floorLevel);
  }

  void exitBuilding() {
    _activeBuilding = null;
    _currentPosition = null;
    _activeFloor = 0;
  }

  void updatePosition(LatLng position) {
    _currentPosition = position;
    final detectedFloor = detectFloor(position.altitude ?? 0.0);
    if (detectedFloor != null) {
      _activeFloor = detectedFloor;
    }
  }

  List<Corridor> getCorridorsOnFloor(String buildingId, int floor) {
    final map = _maps[buildingId];
    if (map == null) {
      return const <Corridor>[];
    }
    return map.floors
        .where((level) => level.floorLevel == floor)
        .expand((level) => level.corridors)
        .toList(growable: false);
  }

  List<DoorNode> getDoorsOnFloor(String buildingId, int floor) {
    final map = _maps[buildingId];
    if (map == null) {
      return const <DoorNode>[];
    }
    return map.floors
        .where((level) => level.floorLevel == floor)
        .expand((level) => level.doors)
        .toList(growable: false);
  }

  Future<List<LatLng>> routeIndoor(
    LatLng origin,
    LatLng destination,
    String buildingId, {
    int? targetFloor,
  }) async {
    final map = _maps[buildingId];
    if (map == null || map.floors.isEmpty) {
      return const <LatLng>[];
    }

    final startFloor = detectFloor(origin.altitude ?? 0.0) ?? _activeFloor;
    final endFloor = targetFloor ?? detectFloor(destination.altitude ?? 0.0) ?? startFloor;
    final graph = _buildGraph(map);

    final startKey = 'origin@$startFloor';
    final endKey = 'destination@$endFloor';
    final nearestStart = _nearestNodeKey(graph, origin, startFloor);
    final nearestEnd = _nearestNodeKey(graph, destination, endFloor);
    if (nearestStart == null || nearestEnd == null) {
      return <LatLng>[origin, destination];
    }

    graph.nodes[startKey] = _GraphNode(startKey, origin, startFloor);
    graph.nodes[endKey] = _GraphNode(endKey, destination, endFloor);
    graph.edges[startKey] = <_GraphEdge>[
      _GraphEdge(nearestStart, origin.distanceTo(graph.nodes[nearestStart]!.point))
    ];
    graph.edges[endKey] = <_GraphEdge>[];
    graph.edges.putIfAbsent(nearestEnd, () => <_GraphEdge>[]).add(
      _GraphEdge(endKey, destination.distanceTo(graph.nodes[nearestEnd]!.point)),
    );
    graph.edges.putIfAbsent(nearestStart, () => <_GraphEdge>[]).add(
      _GraphEdge(startKey, origin.distanceTo(graph.nodes[nearestStart]!.point)),
    );

    final pathKeys = _aStar(graph, startKey, endKey);
    if (pathKeys.isEmpty) {
      return <LatLng>[origin, destination];
    }

    final points = pathKeys.map((key) => graph.nodes[key]!.point).toList(growable: false);
    return points;
  }

  int? detectFloor(double altitude) {
    if (_activeBuilding == null) {
      return altitude.isNaN ? null : (altitude / 4.0).round();
    }
    final floors = _maps[_activeBuilding!]!.floors.map((f) => f.floorLevel).toList();
    if (floors.isEmpty || altitude.isNaN) {
      return null;
    }
    floors.sort();
    final estimated = (altitude / 4.0).round();
    return floors.reduce(
      (a, b) => (a - estimated).abs() <= (b - estimated).abs() ? a : b,
    );
  }

  bool isInsideBuilding(LatLng position, String buildingId) {
    final map = _maps[buildingId];
    if (map == null) {
      return false;
    }
    return map.floors.any((floor) => _contains(floor.bounds, position));
  }

  DoorNode? getNearestDoor(LatLng position, String buildingId, int floor) {
    final doors = getDoorsOnFloor(buildingId, floor);
    if (doors.isEmpty) {
      return null;
    }
    return doors.reduce(
      (a, b) => a.position.distanceTo(position) <= b.position.distanceTo(position) ? a : b,
    );
  }

  bool get isIndoors => _activeBuilding != null;

  String? get activeBuildingId => _activeBuilding;

  _IndoorGraph _buildGraph(IndoorMap map) {
    final nodes = <String, _GraphNode>{};
    final edges = <String, List<_GraphEdge>>{};

    void addNode(String key, LatLng point, int floor) {
      nodes.putIfAbsent(key, () => _GraphNode(key, point, floor));
      edges.putIfAbsent(key, () => <_GraphEdge>[]);
    }

    void addEdge(String from, String to, double weight) {
      edges.putIfAbsent(from, () => <_GraphEdge>[]).add(_GraphEdge(to, weight));
    }

    for (final floor in map.floors) {
      for (final corridor in floor.corridors) {
        for (var i = 0; i < corridor.path.length; i++) {
          final key = _nodeKey(corridor.path[i], floor.floorLevel);
          addNode(key, corridor.path[i], floor.floorLevel);
          if (i == 0) {
            continue;
          }
          final previousKey = _nodeKey(corridor.path[i - 1], floor.floorLevel);
          final distance = corridor.path[i - 1].distanceTo(corridor.path[i]) /
              max(0.3, corridor.speedMultiplier);
          addEdge(previousKey, key, distance);
          if (corridor.bidirectional) {
            addEdge(key, previousKey, distance);
          }
        }
      }
      for (final door in floor.doors) {
        final doorKey = 'door:${door.id}@${door.floorLevel}';
        addNode(doorKey, door.position, door.floorLevel);
        final corridorNodes = nodes.values
            .where((node) => node.floor == floor.floorLevel)
            .toList(growable: false);
        if (corridorNodes.isNotEmpty) {
          corridorNodes.sort(
            (a, b) => a.point.distanceTo(door.position).compareTo(b.point.distanceTo(door.position)),
          );
          for (final candidate in corridorNodes.take(2)) {
            final weight = candidate.point.distanceTo(door.position);
            addEdge(doorKey, candidate.id, weight);
            addEdge(candidate.id, doorKey, weight);
          }
        }
      }
    }

    final allDoors = map.floors.expand((floor) => floor.doors).toList(growable: false);
    for (final door in allDoors) {
      if (door.connectsToDoorId == null) {
        continue;
      }
      final other = allDoors.where((candidate) => candidate.id == door.connectsToDoorId).firstOrNull;
      if (other == null) {
        continue;
      }
      final fromKey = 'door:${door.id}@${door.floorLevel}';
      final toKey = 'door:${other.id}@${other.floorLevel}';
      final verticalPenalty = 6.0 + ((door.floorLevel - other.floorLevel).abs() * 4.0);
      addEdge(fromKey, toKey, verticalPenalty);
      addEdge(toKey, fromKey, verticalPenalty);
    }

    return _IndoorGraph(nodes, edges);
  }

  String? _nearestNodeKey(_IndoorGraph graph, LatLng point, int floor) {
    final candidates = graph.nodes.values.where((node) => node.floor == floor).toList(growable: false);
    if (candidates.isEmpty) {
      return null;
    }
    candidates.sort((a, b) => a.point.distanceTo(point).compareTo(b.point.distanceTo(point)));
    return candidates.first.id;
  }

  List<String> _aStar(_IndoorGraph graph, String start, String goal) {
    final openSet = <_AStarEntry>[_AStarEntry(start, 0.0)];
    final cameFrom = <String, String>{};
    final gScore = <String, double>{start: 0.0};

    while (openSet.isNotEmpty) {
      openSet.sort((a, b) => a.priority.compareTo(b.priority));
      final current = openSet.removeAt(0).key;
      if (current == goal) {
        return _reconstructPath(cameFrom, current);
      }

      for (final edge in graph.edges[current] ?? const <_GraphEdge>[]) {
        final tentative = (gScore[current] ?? double.infinity) + edge.weight;
        if (tentative < (gScore[edge.to] ?? double.infinity)) {
          cameFrom[edge.to] = current;
          gScore[edge.to] = tentative;
          final heuristic = _heuristic(graph.nodes[edge.to]!, graph.nodes[goal]!);
          openSet.add(_AStarEntry(edge.to, tentative + heuristic));
        }
      }
    }

    return const <String>[];
  }

  List<String> _reconstructPath(Map<String, String> cameFrom, String current) {
    final path = <String>[current];
    var cursor = current;
    while (cameFrom.containsKey(cursor)) {
      cursor = cameFrom[cursor]!;
      path.add(cursor);
    }
    return path.reversed.toList(growable: false);
  }

  double _heuristic(_GraphNode from, _GraphNode to) {
    final floorPenalty = (from.floor - to.floor).abs() * 8.0;
    return from.point.distanceTo(to.point) + floorPenalty;
  }

  String _nodeKey(LatLng point, int floor) {
    return '${point.latitude.toStringAsFixed(6)},${point.longitude.toStringAsFixed(6)}@$floor';
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
}

class _IndoorGraph {
  _IndoorGraph(this.nodes, this.edges);

  final Map<String, _GraphNode> nodes;
  final Map<String, List<_GraphEdge>> edges;
}

class _GraphNode {
  const _GraphNode(this.id, this.point, this.floor);

  final String id;
  final LatLng point;
  final int floor;
}

class _GraphEdge {
  const _GraphEdge(this.to, this.weight);

  final String to;
  final double weight;
}

class _AStarEntry {
  const _AStarEntry(this.key, this.priority);

  final String key;
  final double priority;
}

extension IterableFirstOrNullExtension<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
