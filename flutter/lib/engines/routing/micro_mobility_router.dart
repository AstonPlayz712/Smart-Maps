import 'package:uuid/uuid.dart';

import '../../models/latlng.dart';
import '../../models/mode_strand.dart';
import '../../models/route_filament.dart';
import '../geo_utils.dart';

class MicroMobilityRouter {
  Future<RouteFilament> route(LatLng origin, LatLng destination) async {
    final directDistance = GeoUtils.haversineMeters(origin, destination);
    final distanceMeters = directDistance * 1.06;
    final durationSec = distanceMeters / 3.5;
    final path = GeoUtils.samplePath(
      origin,
      destination,
      waypointCount: 34,
      noiseMeters: 5,
      seed: GeoUtils.seedFromPoints(origin, destination, 41),
    );

    final maneuvers = <ManeuverInstruction>[
      ManeuverInstruction(
        type: ManeuverType.depart,
        description: 'Start the micro-mobility leg and stay in permitted areas.',
        location: origin,
        pathIndex: 0,
        distanceFromStartMeters: 0,
        mode: TravelMode.microMobility,
      ),
      ManeuverInstruction(
        type: ManeuverType.arrive,
        description: 'Arrive at your destination and park safely.',
        location: destination,
        pathIndex: path.length - 1,
        distanceFromStartMeters: distanceMeters,
        mode: TravelMode.microMobility,
      ),
    ];

    final strand = ModeStrand(
      mode: TravelMode.microMobility,
      path: path,
      distanceMeters: distanceMeters,
      durationSec: durationSec,
      maneuvers: maneuvers,
      speedLimitMps: 5.56,
    );

    return RouteFilament(
      id: const Uuid().v4(),
      type: FilamentType.primary,
      path: path,
      distanceMeters: distanceMeters,
      durationSec: durationSec,
      strands: [strand],
      createdAt: DateTime.now(),
    );
  }
}
