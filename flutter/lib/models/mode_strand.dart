import 'package:uuid/uuid.dart';

import 'corridor.dart';
import 'latlng.dart';

enum TravelMode { walk, cycle, drive, transit, microMobility, ferry, indoor }

enum ManeuverType {
  depart,
  continueStraight,
  turnLeft,
  turnRight,
  slightLeft,
  slightRight,
  sharpLeft,
  sharpRight,
  keepLeft,
  keepRight,
  merge,
  uTurn,
  roundabout,
  arrive,
  boardTransit,
  exitTransit,
  left,
  right,
  straight,
}

enum LaneDirection { left, slightLeft, straight, slightRight, right, uTurn }

class Lane {
  const Lane({required this.directions, this.isActive = false});

  final List<LaneDirection> directions;
  final bool isActive;

  Lane copyWith({List<LaneDirection>? directions, bool? isActive}) {
    return Lane(
      directions: directions ?? this.directions,
      isActive: isActive ?? this.isActive,
    );
  }
}

class LaneGuidance {
  const LaneGuidance({
    required this.maneuverType,
    required this.lanes,
    required this.recommendedLaneIndex,
    required this.instruction,
  });

  final ManeuverType maneuverType;
  final List<Lane> lanes;
  final int recommendedLaneIndex;
  final String instruction;
}

final Uuid _uuid = Uuid();

class ManeuverInstruction {
  ManeuverInstruction({
    String? id,
    required this.type,
    String? description,
    LatLng? location,
    int? pathIndex,
    double? distanceMeters,
    double? distanceFromStartMeters,
    required this.mode,
    this.bearingBefore,
    this.bearingAfter,
    this.roadName,
    this.lineName,
    this.destinationName,
  })  : id = id ?? _uuid.v4(),
        description = description ?? '',
        location = location ?? const LatLng(0, 0),
        pathIndex = pathIndex ?? 0,
        distanceFromStartMeters = distanceFromStartMeters ?? distanceMeters ?? 0,
        distanceMeters = distanceMeters ?? distanceFromStartMeters ?? 0;

  final String id;
  final ManeuverType type;
  final String description;
  final LatLng location;
  final int pathIndex;
  final double distanceMeters;
  final double distanceFromStartMeters;
  final TravelMode mode;
  final double? bearingBefore;
  final double? bearingAfter;
  final String? roadName;
  final String? lineName;
  final String? destinationName;

  String get text => description;
  double? get bearingDeg => bearingAfter ?? bearingBefore;

  ManeuverInstruction copyWith({
    String? id,
    ManeuverType? type,
    String? description,
    LatLng? location,
    int? pathIndex,
    double? distanceMeters,
    double? distanceFromStartMeters,
    TravelMode? mode,
    Object? bearingBefore = _sentinel,
    Object? bearingAfter = _sentinel,
    Object? roadName = _sentinel,
    Object? lineName = _sentinel,
    Object? destinationName = _sentinel,
  }) {
    return ManeuverInstruction(
      id: id ?? this.id,
      type: type ?? this.type,
      description: description ?? this.description,
      location: location ?? this.location,
      pathIndex: pathIndex ?? this.pathIndex,
      distanceMeters: distanceMeters ?? this.distanceMeters,
      distanceFromStartMeters:
          distanceFromStartMeters ?? this.distanceFromStartMeters,
      mode: mode ?? this.mode,
      bearingBefore: identical(bearingBefore, _sentinel)
          ? this.bearingBefore
          : bearingBefore as double?,
      bearingAfter: identical(bearingAfter, _sentinel)
          ? this.bearingAfter
          : bearingAfter as double?,
      roadName: identical(roadName, _sentinel) ? this.roadName : roadName as String?,
      lineName: identical(lineName, _sentinel) ? this.lineName : lineName as String?,
      destinationName: identical(destinationName, _sentinel)
          ? this.destinationName
          : destinationName as String?,
    );
  }
}

class ModeStrand {
  const ModeStrand({
    required this.mode,
    required this.path,
    required this.distanceMeters,
    required this.durationSec,
    this.maneuvers = const <ManeuverInstruction>[],
    this.speedLimitMps,
    this.transitLine,
    this.isRealTime = false,
    this.corridors = const <Corridor>[],
    this.doorNodes = const <DoorNode>[],
  });

  final TravelMode mode;
  final List<LatLng> path;
  final double distanceMeters;
  final double durationSec;
  final List<ManeuverInstruction> maneuvers;
  final double? speedLimitMps;
  final String? transitLine;
  final bool isRealTime;
  final List<Corridor> corridors;
  final List<DoorNode> doorNodes;

  TravelMode get travelMode => mode;

  ModeStrand copyWith({
    TravelMode? mode,
    List<LatLng>? path,
    double? distanceMeters,
    double? durationSec,
    List<ManeuverInstruction>? maneuvers,
    Object? speedLimitMps = _sentinel,
    Object? transitLine = _sentinel,
    bool? isRealTime,
    List<Corridor>? corridors,
    List<DoorNode>? doorNodes,
  }) {
    return ModeStrand(
      mode: mode ?? this.mode,
      path: path ?? this.path,
      distanceMeters: distanceMeters ?? this.distanceMeters,
      durationSec: durationSec ?? this.durationSec,
      maneuvers: maneuvers ?? this.maneuvers,
      speedLimitMps: identical(speedLimitMps, _sentinel)
          ? this.speedLimitMps
          : speedLimitMps as double?,
      transitLine: identical(transitLine, _sentinel)
          ? this.transitLine
          : transitLine as String?,
      isRealTime: isRealTime ?? this.isRealTime,
      corridors: corridors ?? this.corridors,
      doorNodes: doorNodes ?? this.doorNodes,
    );
  }
}

const Object _sentinel = Object();
