import 'latlng.dart';

enum CorridorType {
  ferry,
  indoor,
  hallway,
  connector,
  stairs,
  escalator,
  lift,
  movingWalkway,
}

class DoorNode {
  const DoorNode({
    required this.id,
    LatLng? location,
    LatLng? position,
    this.floorLevel = 0,
    this.buildingId,
    this.name,
    this.connectsToDoorId,
    this.isEntrance = false,
    this.isExit = false,
  }) : position = position ?? location ?? const LatLng(0, 0);

  final String id;
  final LatLng position;
  final int floorLevel;
  final String? buildingId;
  final String? name;
  final String? connectsToDoorId;
  final bool isEntrance;
  final bool isExit;

  LatLng get location => position;

  DoorNode copyWith({
    String? id,
    LatLng? location,
    LatLng? position,
    int? floorLevel,
    Object? buildingId = _sentinel,
    Object? name = _sentinel,
    Object? connectsToDoorId = _sentinel,
    bool? isEntrance,
    bool? isExit,
  }) {
    return DoorNode(
      id: id ?? this.id,
      position: position ?? location ?? this.position,
      floorLevel: floorLevel ?? this.floorLevel,
      buildingId: identical(buildingId, _sentinel)
          ? this.buildingId
          : buildingId as String?,
      name: identical(name, _sentinel) ? this.name : name as String?,
      connectsToDoorId: identical(connectsToDoorId, _sentinel)
          ? this.connectsToDoorId
          : connectsToDoorId as String?,
      isEntrance: isEntrance ?? this.isEntrance,
      isExit: isExit ?? this.isExit,
    );
  }
}

class Corridor {
  const Corridor({
    required this.id,
    required this.type,
    required this.path,
    this.floorLevel = 0,
    this.buildingId,
    this.doorNodes = const <DoorNode>[],
    this.bidirectional = true,
    this.speedMultiplier = 1.0,
  });

  final String id;
  final CorridorType type;
  final List<LatLng> path;
  final int floorLevel;
  final String? buildingId;
  final List<DoorNode> doorNodes;
  final bool bidirectional;
  final double speedMultiplier;

  Corridor copyWith({
    String? id,
    CorridorType? type,
    List<LatLng>? path,
    int? floorLevel,
    Object? buildingId = _sentinel,
    List<DoorNode>? doorNodes,
    bool? bidirectional,
    double? speedMultiplier,
  }) {
    return Corridor(
      id: id ?? this.id,
      type: type ?? this.type,
      path: path ?? this.path,
      floorLevel: floorLevel ?? this.floorLevel,
      buildingId: identical(buildingId, _sentinel)
          ? this.buildingId
          : buildingId as String?,
      doorNodes: doorNodes ?? this.doorNodes,
      bidirectional: bidirectional ?? this.bidirectional,
      speedMultiplier: speedMultiplier ?? this.speedMultiplier,
    );
  }
}

const Object _sentinel = Object();
