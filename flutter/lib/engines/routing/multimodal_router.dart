import 'package:uuid/uuid.dart';

import '../../models/latlng.dart';
import '../../models/mode_strand.dart';
import '../../models/route_filament.dart';
import '../geo_utils.dart';
import 'transit_router.dart';
import 'walking_router.dart';

class MultimodalRouter {
  MultimodalRouter(this._walking, this._transit);

  final WalkingRouter _walking;
  final TransitRouter _transit;

  Future<RouteFilament> route(LatLng origin, LatLng destination) async {
    final transitReference = await _transit.route(origin, destination);
    final transitStrands = transitReference.strands;
    final walkToStopTarget = transitStrands.first.path.last;
    final walkFromStopOrigin = transitStrands.last.path.first;

    final walkOut = await _walking.route(origin, walkToStopTarget);
    final walkIn = await _walking.route(walkFromStopOrigin, destination);
    final transitCore = transitStrands.firstWhere(
      (strand) => strand.mode == TravelMode.transit,
      orElse: () => transitStrands[1],
    );

    final combinedPath = GeoUtils.concatenatePaths([
      walkOut.path,
      transitCore.path,
      walkIn.path,
    ]);
    final totalDistance =
        walkOut.distanceMeters + transitCore.distanceMeters + walkIn.distanceMeters;
    final totalDuration =
        walkOut.durationSec + transitCore.durationSec + walkIn.durationSec + 120;

    final firstWalk = walkOut.strands.first.copyWith(
      maneuvers: [
        walkOut.strands.first.maneuvers.first.copyWith(
          description: 'Walk to the nearest transit stop.',
          distanceFromStartMeters: 0,
        ),
        walkOut.strands.first.maneuvers.last.copyWith(
          description: 'Arrive at the boarding stop.',
          distanceFromStartMeters: walkOut.distanceMeters,
        ),
      ],
    );
    final transitOffset = walkOut.distanceMeters;
    final transitStrand = transitCore.copyWith(
      maneuvers: transitCore.maneuvers
          .map(
            (maneuver) => maneuver.copyWith(
              distanceFromStartMeters:
                  transitOffset + maneuver.distanceFromStartMeters - 400,
            ),
          )
          .toList(growable: false),
    );
    final finalWalkOffset = walkOut.distanceMeters + transitCore.distanceMeters;
    final finalWalk = walkIn.strands.first.copyWith(
      maneuvers: [
        walkIn.strands.first.maneuvers.first.copyWith(
          description: 'Walk from the transit stop to the destination.',
          distanceFromStartMeters: finalWalkOffset,
        ),
        walkIn.strands.first.maneuvers.last.copyWith(
          description: 'Arrive at your destination.',
          distanceFromStartMeters: totalDistance,
        ),
      ],
    );

    final strands = [firstWalk, transitStrand, finalWalk];

    return RouteFilament(
      id: const Uuid().v4(),
      type: FilamentType.multimodal,
      path: combinedPath,
      distanceMeters: totalDistance,
      durationSec: totalDuration,
      strands: strands,
      createdAt: DateTime.now(),
      disruptionNodes: transitReference.disruptionNodes,
      corridors: transitReference.corridors,
      gates: transitReference.gates,
      complianceZones: walkOut.complianceZones,
      frictionAbsorptionSec: 120,
    );
  }
}
