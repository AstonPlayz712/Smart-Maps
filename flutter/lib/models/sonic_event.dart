import 'mode_strand.dart';

enum SonicEventType {
  maneuver,
  reroute,
  arrival,
  disruption,
  transit,
  approaching,
  earcon,
}

enum SonicPriority { low, normal, high, urgent }

class SonicEvent {
  final String id;
  final SonicEventType type;
  final SonicPriority priority;
  final String? text;
  final String? assetPath;
  final double? bearingDeg;
  final Duration? duration;
  final ManeuverInstruction? maneuverInstruction;
  final DateTime createdAt;

  SonicEvent({
    required this.id,
    required this.type,
    required this.priority,
    this.text,
    this.assetPath,
    this.bearingDeg,
    this.duration,
    this.maneuverInstruction,
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  bool get isUrgent => priority == SonicPriority.urgent;
}
