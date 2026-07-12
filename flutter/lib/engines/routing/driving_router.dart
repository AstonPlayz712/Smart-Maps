import 'package:uuid/uuid.dart';

import '../../models/latlng.dart';
import '../../models/mode_strand.dart';
import '../../models/route_filament.dart';
import '../geo_utils.dart';

class DrivingRouter {
  Future<RouteFilament> route(LatLng origin, LatLng destination) async {
    final directDistance = GeoUtils.haversineMeters(origin, destination);
    final distanceMeters = directDistance * 1.25;
    final durationSec = distanceMeters / 13.9;
    final path = GeoUtils.samplePath(
      origin,
      destination,
      waypointCount: 50,
      noiseMeters: 18,
      seed: GeoUtils.seedFromPoints(origin, destination, 11),
    );

    final maneuvers = <ManeuverInstruction>[
      ManeuverInstruction(
        type: ManeuverType.depart,
        description: 'Depart from origin and follow the road ahead.',
        location: origin,
        pathIndex: 0,
        distanceFromStartMeters: 0,
        mode: TravelMode.drive,
      ),
      ManeuverInstruction(
        type: ManeuverType.arrive,
        description: 'Arrive at your destination.',
        location: destination,
        pathIndex: path.length - 1,
        distanceFromStartMeters: distanceMeters,
        mode: TravelMode.drive,
      ),
    ];

    final strand = ModeStrand(
      mode: TravelMode.drive,
      path: path,
      distanceMeters: distanceMeters,
      durationSec: durationSec,
      maneuvers: maneuvers,
      speedLimitMps: 13.9,
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
