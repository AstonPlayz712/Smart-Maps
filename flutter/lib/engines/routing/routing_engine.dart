import '../../models/disruption_node.dart';
import '../../models/latlng.dart';
import '../../models/mode_strand.dart';
import '../../models/route_filament.dart';
import '../geo_utils.dart';
import 'cycling_router.dart';
import 'driving_router.dart';
import 'eta_calculator.dart';
import 'ferry_router.dart';
import 'indoor_router.dart';
import 'micro_mobility_router.dart';
import 'multimodal_router.dart';
import 'transit_router.dart';
import 'walking_router.dart';

class RoutingEngine {
  RoutingEngine({
    DrivingRouter? driving,
    TransitRouter? transit,
    WalkingRouter? walking,
    CyclingRouter? cycling,
    MicroMobilityRouter? microMobility,
    FerryRouter? ferry,
    IndoorRouter? indoor,
    EtaCalculator? etaCalculator,
  }) : this._(
          driving: driving ?? DrivingRouter(),
          transit: transit ?? TransitRouter(),
          walking: walking ?? WalkingRouter(),
          cycling: cycling ?? CyclingRouter(),
          microMobility: microMobility ?? MicroMobilityRouter(),
          ferry: ferry ?? FerryRouter(),
          indoor: indoor ?? IndoorRouter(),
          etaCalculator: etaCalculator ?? EtaCalculator(),
        );

  RoutingEngine._({
    required DrivingRouter driving,
    required TransitRouter transit,
    required WalkingRouter walking,
    required CyclingRouter cycling,
    required MicroMobilityRouter microMobility,
    required FerryRouter ferry,
    required IndoorRouter indoor,
    required EtaCalculator etaCalculator,
  })  : _driving = driving,
        _transit = transit,
        _walking = walking,
        _cycling = cycling,
        _microMobility = microMobility,
        _ferry = ferry,
        _indoor = indoor,
        _etaCalculator = etaCalculator,
        _multimodal = MultimodalRouter(walking, transit);

  final DrivingRouter _driving;
  final TransitRouter _transit;
  final WalkingRouter _walking;
  final CyclingRouter _cycling;
  final MicroMobilityRouter _microMobility;
  final FerryRouter _ferry;
  final MultimodalRouter _multimodal;
  final IndoorRouter _indoor;
  final EtaCalculator _etaCalculator;

  Future<RouteFilament> route(
    LatLng origin,
    LatLng destination,
    TravelMode mode,
  ) {
    switch (mode) {
      case TravelMode.drive:
        return _driving.route(origin, destination);
      case TravelMode.transit:
        return _transit.route(origin, destination);
      case TravelMode.walk:
        return _walking.route(origin, destination);
      case TravelMode.cycle:
        return _cycling.route(origin, destination);
      case TravelMode.microMobility:
        return _microMobility.route(origin, destination);
      case TravelMode.ferry:
        return _ferry.route(origin, destination);
      case TravelMode.indoor:
        return _indoor.route(origin, destination, 'default-building');
    }
  }

  Future<List<RouteFilament>> routeWithAlternates(
    LatLng origin,
    LatLng destination,
    TravelMode mode, {
    int maxAlternates = 3,
  }) async {
    final primary = await route(origin, destination, mode);
    final results = <RouteFilament>[primary];

    for (var i = 1; i <= maxAlternates; i++) {
      results.add(_alternateVariant(primary, i));
    }

    return results;
  }

  Future<RouteFilament> routeMultimodal(LatLng origin, LatLng destination) {
    return _multimodal.route(origin, destination);
  }

  Future<RouteFilament> routeIndoor(
    LatLng origin,
    LatLng destination,
    String buildingId,
  ) {
    return _indoor.route(origin, destination, buildingId);
  }

  Future<RouteFilament?> degradeRoute(
    RouteFilament filament,
    DisruptionNode disruption,
  ) async {
    if (filament.path.isEmpty) {
      return null;
    }

    final nearOrigin =
        GeoUtils.haversineMeters(filament.path.first, disruption.location);
    final nearDestination =
        GeoUtils.haversineMeters(filament.path.last, disruption.location);
    if (disruption.isBlocking &&
        (nearOrigin <= disruption.radiusMeters ||
            nearDestination <= disruption.radiusMeters)) {
      return null;
    }

    final impacted = filament.path.any(
      (point) =>
          GeoUtils.haversineMeters(point, disruption.location) <=
          disruption.radiusMeters,
    );

    if (!impacted) {
      return filament.copyWith(
        id: '${filament.id}-degraded',
        type: FilamentType.degraded,
        disruptionNodes: [...filament.disruptionNodes, disruption],
      );
    }

    final reroutedPath = <LatLng>[];
    for (var i = 0; i < filament.path.length; i++) {
      final point = filament.path[i];
      final distance = GeoUtils.haversineMeters(point, disruption.location);
      if (distance > disruption.radiusMeters ||
          i == 0 ||
          i == filament.path.length - 1) {
        reroutedPath.add(point);
        continue;
      }

      final escapeBearing = distance < 1
          ? GeoUtils.bearingDegrees(filament.path[i - 1], filament.path[i + 1]) +
              90
          : GeoUtils.bearingDegrees(disruption.location, point);
      reroutedPath.add(
        GeoUtils.offsetPoint(
          point,
          distanceMeters: disruption.radiusMeters - distance + 20,
          bearingDeg: escapeBearing,
        ),
      );
    }

    final reroutedDistance = GeoUtils.polylineDistanceMeters(reroutedPath);
    final speed =
        filament.durationSec <= 0 ? 0.0 : filament.distanceMeters / filament.durationSec;
    final reroutedDuration =
        speed <= 0 ? filament.durationSec : reroutedDistance / speed;
    final distanceScale =
        filament.distanceMeters == 0 ? 1.0 : reroutedDistance / filament.distanceMeters;

    final updatedStrands = filament.strands
        .map(
          (strand) => strand.copyWith(
            distanceMeters: strand.distanceMeters * distanceScale,
            durationSec: strand.durationSec * distanceScale,
          ),
        )
        .toList(growable: false);

    return filament.copyWith(
      id: '${filament.id}-degraded',
      type: FilamentType.degraded,
      path: reroutedPath,
      distanceMeters: reroutedDistance,
      durationSec: reroutedDuration,
      strands: updatedStrands,
      disruptionNodes: [...filament.disruptionNodes, disruption],
      frictionAbsorptionSec:
          filament.frictionAbsorptionSec + disruption.frictionAddedSec,
    );
  }

  double computeEta(RouteFilament filament, double currentSpeedMps) {
    return _etaCalculator.calculate(filament, currentSpeedMps);
  }

  RouteFilament _alternateVariant(RouteFilament primary, int index) {
    final adjustedPath = <LatLng>[];

    for (var i = 0; i < primary.path.length; i++) {
      final point = primary.path[i];
      if (i == 0 || i == primary.path.length - 1) {
        adjustedPath.add(point);
        continue;
      }

      final previous = primary.path[i - 1];
      final next = primary.path[i + 1];
      final bearing = GeoUtils.bearingDegrees(previous, next);
      final shift = (6 + index * 6) * (i.isEven ? 1 : -1);
      adjustedPath.add(
        GeoUtils.offsetPoint(
          point,
          distanceMeters: shift.toDouble(),
          bearingDeg: bearing + 90,
        ),
      );
    }

    final distanceMeters = primary.distanceMeters * (1 + (0.03 * index));
    final durationSec = primary.durationSec * (1 + (0.04 * index));
    final strands = primary.strands
        .map(
          (strand) => strand.copyWith(
            distanceMeters: strand.distanceMeters * (1 + (0.03 * index)),
            durationSec: strand.durationSec * (1 + (0.04 * index)),
          ),
        )
        .toList(growable: false);

    return primary.copyWith(
      id: '${primary.id}-alt-$index',
      type: FilamentType.alternate,
      path: adjustedPath,
      distanceMeters: distanceMeters,
      durationSec: durationSec,
      strands: strands,
    );
  }
}
