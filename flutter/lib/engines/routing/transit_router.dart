import 'package:uuid/uuid.dart';

import '../../models/latlng.dart';
import '../../models/mode_strand.dart';
import '../../models/route_filament.dart';
import '../geo_utils.dart';

class TransitRouter {
  Future<RouteFilament> route(LatLng origin, LatLng destination) async {
    final directDistance = GeoUtils.haversineMeters(origin, destination);
    final totalDistance = directDistance * 1.1;
    final routeBearing = GeoUtils.bearingDegrees(origin, destination);
    final originStop = GeoUtils.offsetPoint(
      origin,
      distanceMeters: 400,
      bearingDeg: routeBearing,
    );
    final destinationStop = GeoUtils.offsetPoint(
      destination,
      distanceMeters: 400,
      bearingDeg: GeoUtils.normalizeBearing(routeBearing + 180),
    );

    final firstWalkPath = GeoUtils.samplePath(
      origin,
      originStop,
      waypointCount: 8,
      noiseMeters: 4,
      seed: GeoUtils.seedFromPoints(origin, originStop, 51),
    );
    final transitPath = GeoUtils.samplePath(
      originStop,
      destinationStop,
      waypointCount: 22,
      noiseMeters: 10,
      seed: GeoUtils.seedFromPoints(originStop, destinationStop, 52),
    );
    final lastWalkPath = GeoUtils.samplePath(
      destinationStop,
      destination,
      waypointCount: 8,
      noiseMeters: 4,
      seed: GeoUtils.seedFromPoints(destinationStop, destination, 53),
    );

    const walkSpeed = 1.4;
    const transitSpeed = 30 / 3.6;
    final walk1Distance = 400.0;
    final walk2Distance = 400.0;
    final transitDistance = (totalDistance - walk1Distance - walk2Distance).clamp(0.0, double.infinity).toDouble();

    final walk1Duration = walk1Distance / walkSpeed;
    final walk2Duration = walk2Distance / walkSpeed;
    final transitDuration = transitDistance / transitSpeed;
    final totalDuration = walk1Duration + walk2Duration + 120 + transitDuration;

    final walkOut = ModeStrand(
      mode: TravelMode.walk,
      path: firstWalkPath,
      distanceMeters: walk1Distance,
      durationSec: walk1Duration,
      maneuvers: [
        ManeuverInstruction(
          type: ManeuverType.depart,
          description: 'Walk to the nearest transit stop.',
          location: origin,
          pathIndex: 0,
          distanceFromStartMeters: 0,
          mode: TravelMode.walk,
        ),
        ManeuverInstruction(
          type: ManeuverType.arrive,
          description: 'Reach the boarding stop.',
          location: originStop,
          pathIndex: firstWalkPath.length - 1,
          distanceFromStartMeters: walk1Distance,
          mode: TravelMode.walk,
        ),
      ],
      speedLimitMps: 1.8,
    );

    final transit = ModeStrand(
      mode: TravelMode.transit,
      path: transitPath,
      distanceMeters: transitDistance,
      durationSec: transitDuration,
      maneuvers: [
        ManeuverInstruction(
          type: ManeuverType.depart,
          description: 'Board Line A after a short wait.',
          location: originStop,
          pathIndex: 0,
          distanceFromStartMeters: walk1Distance,
          mode: TravelMode.transit,
        ),
        ManeuverInstruction(
          type: ManeuverType.arrive,
          description: 'Exit Line A at your stop.',
          location: destinationStop,
          pathIndex: transitPath.length - 1,
          distanceFromStartMeters: walk1Distance + transitDistance,
          mode: TravelMode.transit,
        ),
      ],
      transitLine: 'Line A',
      isRealTime: true,
      speedLimitMps: transitSpeed,
    );

    final walkIn = ModeStrand(
      mode: TravelMode.walk,
      path: lastWalkPath,
      distanceMeters: walk2Distance,
      durationSec: walk2Duration,
      maneuvers: [
        ManeuverInstruction(
          type: ManeuverType.depart,
          description: 'Walk from the transit stop to your destination.',
          location: destinationStop,
          pathIndex: 0,
          distanceFromStartMeters: walk1Distance + transitDistance,
          mode: TravelMode.walk,
        ),
        ManeuverInstruction(
          type: ManeuverType.arrive,
          description: 'Arrive at your destination.',
          location: destination,
          pathIndex: lastWalkPath.length - 1,
          distanceFromStartMeters: totalDistance,
          mode: TravelMode.walk,
        ),
      ],
      speedLimitMps: 1.8,
    );

    return RouteFilament(
      id: const Uuid().v4(),
      type: FilamentType.primary,
      path: GeoUtils.concatenatePaths([firstWalkPath, transitPath, lastWalkPath]),
      distanceMeters: totalDistance,
      durationSec: totalDuration,
      strands: [walkOut, transit, walkIn],
      createdAt: DateTime.now(),
      frictionAbsorptionSec: 120,
    );
  }
}
