import 'package:uuid/uuid.dart';

import '../../models/latlng.dart';
import '../../models/mode_strand.dart';
import '../../models/route_filament.dart';
import '../geo_utils.dart';

class WalkingRouter {
  Future<RouteFilament> route(LatLng origin, LatLng destination) async {
    final directDistance = GeoUtils.haversineMeters(origin, destination);
    final distanceMeters = directDistance * 1.05;
    final durationSec = distanceMeters / 1.4;
    final path = GeoUtils.samplePath(
      origin,
      destination,
      waypointCount: 30,
      noiseMeters: 6,
      seed: GeoUtils.seedFromPoints(origin, destination, 21),
    );

    final maneuvers = <ManeuverInstruction>[
      ManeuverInstruction(
        type: ManeuverType.depart,
        description: 'Start walking toward the destination.',
        location: origin,
        pathIndex: 0,
        distanceFromStartMeters: 0,
        mode: TravelMode.walk,
      ),
      ManeuverInstruction(
        type: ManeuverType.arrive,
        description: 'You have arrived on foot.',
        location: destination,
        pathIndex: path.length - 1,
        distanceFromStartMeters: distanceMeters,
        mode: TravelMode.walk,
      ),
    ];

    final strand = ModeStrand(
      mode: TravelMode.walk,
      path: path,
      distanceMeters: distanceMeters,
      durationSec: durationSec,
      maneuvers: maneuvers,
      speedLimitMps: 1.8,
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
