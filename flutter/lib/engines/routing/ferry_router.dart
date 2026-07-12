import 'package:uuid/uuid.dart';

import '../../models/corridor.dart';
import '../../models/gate.dart';
import '../../models/latlng.dart';
import '../../models/mode_strand.dart';
import '../../models/route_filament.dart';
import '../geo_utils.dart';

class FerryRouter {
  Future<RouteFilament> route(LatLng origin, LatLng destination) async {
    final directDistance = GeoUtils.haversineMeters(origin, destination);
    final distanceMeters = directDistance * 1.02;
    final durationSec = 300 + (distanceMeters / 5.5);
    final path = GeoUtils.samplePath(
      origin,
      destination,
      waypointCount: 28,
      noiseMeters: 14,
      seed: GeoUtils.seedFromPoints(origin, destination, 61),
    );

    final corridor = Corridor(
      id: const Uuid().v4(),
      type: CorridorType.ferry,
      path: path,
    );
    final gates = [
      Gate(
        id: const Uuid().v4(),
        name: 'Boarding Gate',
        location: origin,
        isEntry: true,
        pathIndex: 0,
      ),
      Gate(
        id: const Uuid().v4(),
        name: 'Arrival Pier',
        location: destination,
        isEntry: false,
        pathIndex: path.length - 1,
      ),
    ];

    final strand = ModeStrand(
      mode: TravelMode.ferry,
      path: path,
      distanceMeters: distanceMeters,
      durationSec: durationSec,
      maneuvers: [
        ManeuverInstruction(
          type: ManeuverType.depart,
          description: 'Board the ferry and prepare for departure.',
          location: origin,
          pathIndex: 0,
          distanceFromStartMeters: 0,
          mode: TravelMode.ferry,
        ),
        ManeuverInstruction(
          type: ManeuverType.arrive,
          description: 'Disembark at the destination pier.',
          location: destination,
          pathIndex: path.length - 1,
          distanceFromStartMeters: distanceMeters,
          mode: TravelMode.ferry,
        ),
      ],
      speedLimitMps: 5.5,
      corridors: [corridor],
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
      frictionAbsorptionSec: 300,
    );
  }
}
