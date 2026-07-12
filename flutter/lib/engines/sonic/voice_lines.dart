import '../../models/mode_strand.dart';
import '../../models/sonic_event.dart';

class VoiceLine {
  final String text;
  final SonicPriority priority;
  final double? panAngle;

  const VoiceLine(this.text, this.priority, {this.panAngle});
}

class VoiceLines {
  const VoiceLines();

  static VoiceLine maneuver(ManeuverInstruction instruction) {
    final action = _maneuverAction(instruction);
    if (instruction.type == ManeuverType.continueStraight ||
        instruction.type == ManeuverType.straight) {
      return VoiceLine(
        'Continue straight for ${_formatDistance(instruction.distanceMeters)}',
        SonicPriority.normal,
        panAngle: null,
      );
    }

    final prefix = instruction.distanceMeters < 200.0
        ? '$action now'
        : 'In ${_formatDistance(instruction.distanceMeters)}, $action';
    final suffix = instruction.roadName == null || instruction.roadName!.trim().isEmpty
        ? ''
        : ' onto ${instruction.roadName}';
    final priority = instruction.distanceMeters < 200.0
        ? SonicPriority.high
        : SonicPriority.normal;
    return VoiceLine('$prefix$suffix', priority, panAngle: null);
  }

  static VoiceLine reroute() {
    return const VoiceLine(
      'Rerouting. New route found.',
      SonicPriority.urgent,
    );
  }

  static VoiceLine arrival(String destinationName) {
    return VoiceLine(
      'You have arrived at $destinationName.',
      SonicPriority.high,
    );
  }

  static VoiceLine disruption(String summary) {
    return VoiceLine(
      'Traffic disruption ahead. $summary',
      SonicPriority.high,
    );
  }

  static VoiceLine transitApproach(String lineName, String destination) {
    return VoiceLine(
      'Next: $lineName towards $destination',
      SonicPriority.normal,
    );
  }

  static VoiceLine approaching(String destinationName) {
    return VoiceLine(
      'Approaching $destinationName',
      SonicPriority.normal,
    );
  }

  void speak(VoiceLine line, {double volume = 1.0}) {
    final clampedVolume = volume.clamp(0.0, 1.0).toDouble();
    // Integration point: hand line.text, line.panAngle, and clampedVolume to flutter_tts.
    // The logic layer keeps this side effect-free for tests.
    if (clampedVolume == 0.0) {
      return;
    }
  }

  static String _formatDistance(double metres) {
    if (metres >= 1000.0) {
      final kilometres = metres / 1000.0;
      final rounded = (kilometres * 10).round() / 10;
      final isWhole = rounded == rounded.roundToDouble();
      final value = isWhole ? rounded.toStringAsFixed(0) : rounded.toStringAsFixed(1);
      return '$value kilometres';
    }

    final roundedMetres = metres >= 100.0
        ? (metres / 10).round() * 10
        : metres.round();
    return '$roundedMetres metres';
  }

  static String _maneuverAction(ManeuverInstruction instruction) {
    switch (instruction.type) {
      case ManeuverType.depart:
        return 'Start out';
      case ManeuverType.straight:
      case ManeuverType.continueStraight:
        return 'Continue straight';
      case ManeuverType.left:
      case ManeuverType.turnLeft:
        return 'Turn left';
      case ManeuverType.right:
      case ManeuverType.turnRight:
        return 'Turn right';
      case ManeuverType.slightLeft:
        return 'Bear left';
      case ManeuverType.slightRight:
        return 'Bear right';
      case ManeuverType.sharpLeft:
        return 'Make a sharp left';
      case ManeuverType.sharpRight:
        return 'Make a sharp right';
      case ManeuverType.keepLeft:
        return 'Keep left';
      case ManeuverType.keepRight:
        return 'Keep right';
      case ManeuverType.merge:
        return 'Merge ahead';
      case ManeuverType.uTurn:
        return 'Make a U-turn';
      case ManeuverType.roundabout:
        return 'Enter the roundabout';
      case ManeuverType.arrive:
        return 'Arrive at your destination';
      case ManeuverType.boardTransit:
        final line = instruction.lineName ?? 'service';
        return 'Board $line';
      case ManeuverType.exitTransit:
        return 'Exit transit';
    }
  }
}
