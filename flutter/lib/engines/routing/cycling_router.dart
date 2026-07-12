import 'package:uuid/uuid.dart';

import '../../models/latlng.dart';
import '../../models/mode_strand.dart';
import '../../models/route_filament.dart';
import '../geo_utils.dart';

class CyclingRouter {
  Future<RouteFilament> route(LatLng origin, LatLng destination) async {
    final directDistance = GeoUtils.haversineMeters(origin, destination);
    final distanceMeters = directDistance * 1.08;
    final durationSec = distanceMeters / 4.5;
    final path = GeoUtils.samplePath(
      origin,
      destination,
      waypointCount: 36,
      noiseMeters: 4,
      seed: GeoUtils.seedFromPoints(origin, destination, 31),
    );

    final maneuvers = <ManeuverInstruction>[
      ManeuverInstruction(
        type: ManeuverType.depart,
        description: 'Begin cycling on the preferred flat route.',
        location: origin,
        pathIndex: 0,
        distanceFromStartMeters: 0,
        mode: TravelMode.cycle,
      ),
      ManeuverInstruction(
        type: ManeuverType.arrive,
        description: 'Arrive at your cycling destination.',
        location: destination,
        pathIndex: path.length - 1,
        distanceFromStartMeters: distanceMeters,
        mode: TravelMode.cycle,
      ),
    ];

    final strand = ModeStrand(
      mode: TravelMode.cycle,
      path: path,
      distanceMeters: distanceMeters,
      durationSec: durationSec,
      maneuvers: maneuvers,
      speedLimitMps: 6.5,
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
