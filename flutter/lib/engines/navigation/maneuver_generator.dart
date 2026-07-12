import '../../models/latlng.dart';
import '../../models/mode_strand.dart';
import '../geo_utils.dart';

class ManeuverGenerator {
  List<ManeuverInstruction> generate(List<LatLng> path, TravelMode mode) {
    if (path.isEmpty) {
      return const [];
    }
    if (path.length == 1) {
      return [
        ManeuverInstruction(
          type: ManeuverType.arrive,
          description: 'Arrive at your destination.',
          location: path.first,
          pathIndex: 0,
          distanceFromStartMeters: 0,
          mode: mode,
        ),
      ];
    }

    final cumulative = GeoUtils.cumulativeDistances(path);
    final instructions = <ManeuverInstruction>[
      ManeuverInstruction(
        type: ManeuverType.depart,
        description: 'Depart and head to the route.',
        location: path.first,
        pathIndex: 0,
        distanceFromStartMeters: 0,
        mode: mode,
      ),
    ];

    for (var i = 1; i < path.length - 1; i++) {
      final before = GeoUtils.bearingDegrees(path[i - 1], path[i]);
      final after = GeoUtils.bearingDegrees(path[i], path[i + 1]);
      final angle = GeoUtils.signedTurnAngle(before, after);
      if (angle.abs() <= 15) {
        continue;
      }
      final type = _classifyTurn(before, after);
      instructions.add(
        ManeuverInstruction(
          type: type,
          description: _describeManeuver(type, before, after),
          location: path[i],
          pathIndex: i,
          distanceFromStartMeters: cumulative[i],
          mode: mode,
          bearingBefore: before,
          bearingAfter: after,
        ),
      );
    }

    instructions.add(
      ManeuverInstruction(
        type: ManeuverType.arrive,
        description: 'Arrive at your destination.',
        location: path.last,
        pathIndex: path.length - 1,
        distanceFromStartMeters: cumulative.last,
        mode: mode,
      ),
    );
    return instructions;
  }

  ManeuverInstruction? nextManeuver(
    List<ManeuverInstruction> instructions,
    LatLng position,
  ) {
    ManeuverInstruction? best;
    var bestDistance = double.infinity;

    for (final instruction in instructions) {
      if (instruction.type == ManeuverType.depart) {
        continue;
      }
      final distance = GeoUtils.haversineMeters(position, instruction.location);
      if (distance < bestDistance && distance > 10) {
        best = instruction;
        bestDistance = distance;
      }
    }

    return best;
  }

  String _describeManeuver(
    ManeuverType type,
    double bearingBefore,
    double bearingAfter,
  ) {
    switch (type) {
      case ManeuverType.depart:
        return 'Depart on the route.';
      case ManeuverType.arrive:
        return 'Arrive at your destination.';
      case ManeuverType.continueStraight:
      case ManeuverType.straight:
      case ManeuverType.merge:
        return 'Continue straight ahead.';
      case ManeuverType.slightLeft:
        return 'Bear slight left.';
      case ManeuverType.turnLeft:
      case ManeuverType.left:
      case ManeuverType.keepLeft:
        return 'Turn left.';
      case ManeuverType.slightRight:
        return 'Bear slight right.';
      case ManeuverType.turnRight:
      case ManeuverType.right:
      case ManeuverType.keepRight:
        return 'Turn right.';
      case ManeuverType.sharpLeft:
        return 'Make a sharp left.';
      case ManeuverType.sharpRight:
        return 'Make a sharp right.';
      case ManeuverType.uTurn:
        return _turnAngle(bearingBefore, bearingAfter) >= 0
            ? 'Make a U-turn to the right.'
            : 'Make a U-turn to the left.';
      case ManeuverType.roundabout:
        return 'Enter the roundabout.';
      case ManeuverType.boardTransit:
        return 'Board transit.';
      case ManeuverType.exitTransit:
        return 'Exit transit.';
    }
  }

  ManeuverType _classifyTurn(double bearingBefore, double bearingAfter) {
    final angle = _turnAngle(bearingBefore, bearingAfter);
    final magnitude = angle.abs();

    if (magnitude < 30) {
      return ManeuverType.straight;
    }
    if (magnitude > 150) {
      return ManeuverType.uTurn;
    }
    if (angle < 0) {
      return magnitude < 75 ? ManeuverType.slightLeft : ManeuverType.left;
    }
    return magnitude < 75 ? ManeuverType.slightRight : ManeuverType.right;
  }

  double _turnAngle(double b1, double b2) {
    return GeoUtils.signedTurnAngle(b1, b2);
  }
}
