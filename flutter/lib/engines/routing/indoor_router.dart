import 'package:uuid/uuid.dart';

import '../../models/corridor.dart';
import '../../models/gate.dart';
import '../../models/latlng.dart';
import '../../models/mode_strand.dart';
import '../../models/route_filament.dart';
import '../geo_utils.dart';

class IndoorRouter {
  Future<RouteFilament> route(
    LatLng origin,
    LatLng destination,
    String buildingId,
  ) async {
    final bearing = GeoUtils.bearingDegrees(origin, destination);
    final elbow1 = GeoUtils.offsetPoint(
      GeoUtils.interpolateGreatCircle(origin, destination, 0.25),
      distanceMeters: 10,
      bearingDeg: bearing + 90,
    );
    final elbow2 = GeoUtils.offsetPoint(
      GeoUtils.interpolateGreatCircle(origin, destination, 0.65),
      distanceMeters: 8,
      bearingDeg: bearing - 90,
    );
    final door1 = DoorNode(
      id: const Uuid().v4(),
      location: GeoUtils.interpolateGreatCircle(origin, destination, 0.2),
      floorLevel: 0,
      buildingId: buildingId,
    );
    final door2 = DoorNode(
      id: const Uuid().v4(),
      location: GeoUtils.interpolateGreatCircle(origin, destination, 0.8),
      floorLevel: 0,
      buildingId: buildingId,
    );

    final path = [
      origin,
      door1.location,
      elbow1,
      GeoUtils.interpolateGreatCircle(origin, destination, 0.5),
      elbow2,
      door2.location,
      destination,
    ];
    final distanceMeters = GeoUtils.polylineDistanceMeters(path);
    final durationSec = distanceMeters / 1.2;

    final corridor = Corridor(
      id: const Uuid().v4(),
      type: CorridorType.indoor,
      path: path,
      floorLevel: 0,
      buildingId: buildingId,
      doorNodes: [door1, door2],
    );
    final gates = [
      Gate(
        id: const Uuid().v4(),
        name: 'Indoor Entry',
        location: origin,
        isEntry: true,
        pathIndex: 0,
      ),
      Gate(
        id: const Uuid().v4(),
        name: 'Indoor Exit',
        location: destination,
        isEntry: false,
        pathIndex: path.length - 1,
      ),
    ];

    final strand = ModeStrand(
      mode: TravelMode.indoor,
      path: path,
      distanceMeters: distanceMeters,
      durationSec: durationSec,
      maneuvers: [
        ManeuverInstruction(
          type: ManeuverType.depart,
          description: 'Enter the building and follow the corridor.',
          location: origin,
          pathIndex: 0,
          distanceFromStartMeters: 0,
          mode: TravelMode.indoor,
        ),
        ManeuverInstruction(
          type: ManeuverType.arrive,
          description: 'Arrive at the indoor destination.',
          location: destination,
          pathIndex: path.length - 1,
          distanceFromStartMeters: distanceMeters,
          mode: TravelMode.indoor,
        ),
      ],
      speedLimitMps: 1.2,
      corridors: [corridor],
      doorNodes: [door1, door2],
    );

    return RouteFilament(
      id: const Uuid().v4(),
      type: FilamentType.primary,
      path: path,
      distanceMeters: distanceMeters,
      durationSec: durationSec,
      strands: [strand],
      createdAt: DateTime.now(),
      corridors: [corridor],
      gates: gates,
    );
  }
}
