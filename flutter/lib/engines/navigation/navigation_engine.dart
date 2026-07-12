import '../../models/gate.dart';
import '../../models/latlng.dart';
import '../../models/mode_strand.dart';
import '../../models/route_filament.dart';
import '../geo_utils.dart';
import '../routing/eta_calculator.dart';
import 'arrival_logic.dart';
import 'lane_guidance.dart';
import 'maneuver_generator.dart';
import 'speed_guidance.dart';

class NavigationEngine {
  NavigationEngine({
    ManeuverGenerator? maneuverGenerator,
    LaneGuidanceEngine? laneGuidance,
    SpeedGuidance? speedGuidance,
    ArrivalLogic? arrivalLogic,
    EtaCalculator? etaCalculator,
  })  : _maneuverGenerator = maneuverGenerator ?? ManeuverGenerator(),
        _laneGuidance = laneGuidance ?? LaneGuidanceEngine(),
        _speedGuidance = speedGuidance ?? SpeedGuidance(),
        _arrivalLogic = arrivalLogic ?? ArrivalLogic(),
        _etaCalculator = etaCalculator ?? EtaCalculator();

  final ManeuverGenerator _maneuverGenerator;
  final LaneGuidanceEngine _laneGuidance;
  final SpeedGuidance _speedGuidance;
  final ArrivalLogic _arrivalLogic;
  final EtaCalculator _etaCalculator;

  RouteFilament? _activeFilament;
  int _currentLegIndex = 0;
  double _progressMeters = 0;
  List<ManeuverInstruction> _maneuvers = const [];
  LatLng? _lastPosition;
  double _lastSpeedMps = 0;
  double? _lastHeadingDeg;

  void beginNavigation(RouteFilament filament) {
    _activeFilament = filament;
    _currentLegIndex = 0;
    _progressMeters = 0;
    _maneuvers = filament.maneuvers.isNotEmpty
        ? filament.maneuvers
        : _maneuverGenerator.generate(
            filament.path,
            filament.strands.isEmpty
                ? TravelMode.walk
                : filament.strands.first.mode,
          );
  }

  void updatePosition(LatLng position, double speedMps, double? headingDeg) {
    final filament = _activeFilament;
    if (filament == null || filament.path.isEmpty) {
      return;
    }
    _lastPosition = position;
    _lastSpeedMps = speedMps;
    _lastHeadingDeg = headingDeg;

    final snapped = _nearestPointOnPath(position, filament.path);
    _progressMeters = snapped.$2;
    _advanceLeg(position);
  }

  ManeuverInstruction? getUpcomingManeuver() {
    final filament = _activeFilament;
    if (filament == null) {
      return null;
    }

    for (final maneuver in _maneuvers) {
      if (maneuver.type == ManeuverType.depart) {
        continue;
      }
      final delta = maneuver.distanceFromStartMeters - _progressMeters;
      if (delta >= 0 && delta <= 200) {
        return maneuver;
      }
    }
    return null;
  }

  LaneGuidance? getCurrentLaneGuidance() {
    final maneuver = getUpcomingManeuver();
    if (maneuver == null) {
      return null;
    }
    final laneCount = maneuver.mode == TravelMode.drive ? 3 : 2;
    return _laneGuidance.getGuidance(maneuver, laneCount);
  }

  double? getSpeedLimit() {
    final filament = _activeFilament;
    if (filament == null || filament.strands.isEmpty) {
      return null;
    }
    final strand = filament.strands[_currentLegIndex.clamp(0, filament.strands.length - 1).toInt()];
    if (_lastPosition != null) {
      final zoneLimit =
          _speedGuidance.getZoneLimit(_lastPosition!, filament.complianceZones);
      if (zoneLimit != null) {
        return zoneLimit;
      }
    }
    return strand.speedLimitMps;
  }

  bool isApproachingJunction(LatLng position) {
    final maneuver = getUpcomingManeuver();
    if (maneuver == null) {
      return false;
    }
    final distance = GeoUtils.haversineMeters(position, maneuver.location);
    final complex = maneuver.type != ManeuverType.straight &&
        maneuver.type != ManeuverType.continueStraight &&
        maneuver.type != ManeuverType.depart &&
        maneuver.type != ManeuverType.arrive;
    return complex && distance <= 150;
  }

  Gate? getNextGate() {
    final filament = _activeFilament;
    if (filament == null || filament.gates.isEmpty) {
      return null;
    }

    Gate? best;
    var bestProgress = double.infinity;
    for (final gate in filament.gates) {
      final gateProgress = gate.pathIndex == null
          ? GeoUtils.nearestPointOnPath(gate.location, filament.path).progressMeters
          : _progressForPathIndex(filament.path, gate.pathIndex!);
      final delta = gateProgress - _progressMeters;
      if (delta >= 0 && delta < bestProgress) {
        bestProgress = delta;
        best = gate;
      }
    }
    return best;
  }

  double getRemainingMeters(LatLng position) {
    final filament = _activeFilament;
    if (filament == null || filament.path.isEmpty) {
      return 0;
    }
    final snapped = _nearestPointOnPath(position, filament.path);
    final total = GeoUtils.cumulativeDistances(filament.path).last;
    return (total - snapped.$2).clamp(0.0, double.infinity).toDouble();
  }

  double getEtaSec(LatLng position, double speedMps) {
    final filament = _activeFilament;
    if (filament == null) {
      return 0;
    }
    return _etaCalculator.remainingEta(filament, position, speedMps);
  }

  bool checkArrival(LatLng position) {
    final filament = _activeFilament;
    final destination = filament?.destination;
    if (destination == null) {
      return false;
    }
    return _arrivalLogic.isArrived(position, destination);
  }

  void snapToFreeLook(LatLng position) {
    final filament = _activeFilament;
    if (filament == null || filament.path.isEmpty) {
      return;
    }
    _progressMeters = _nearestPointOnPath(position, filament.path).$2;
    _lastPosition = position;
  }

  void stopNavigation() {
    _activeFilament = null;
    _currentLegIndex = 0;
    _progressMeters = 0;
    _maneuvers = const [];
    _lastPosition = null;
    _lastSpeedMps = 0;
    _lastHeadingDeg = null;
  }

  void _advanceLeg(LatLng position) {
    final filament = _activeFilament;
    if (filament == null || filament.strands.isEmpty) {
      return;
    }

    var cumulative = 0.0;
    for (var i = 0; i < filament.strands.length; i++) {
      cumulative += filament.strands[i].distanceMeters;
      if (_progressMeters <= cumulative + 20) {
        _currentLegIndex = i;
        return;
      }
    }
    _currentLegIndex = filament.strands.length - 1;
  }

  (int index, double progressMeters) _nearestPointOnPath(
    LatLng position,
    List<LatLng> path,
  ) {
    final snapped = GeoUtils.nearestPointOnPath(position, path);
    return (snapped.index, snapped.progressMeters);
  }

  double _progressForPathIndex(List<LatLng> path, int pathIndex) {
    if (path.isEmpty) {
      return 0;
    }
    final safeIndex = pathIndex.clamp(0, path.length - 1).toInt();
    return GeoUtils.cumulativeDistances(path)[safeIndex];
  }
}
