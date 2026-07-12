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

  /// Spoken text content for TTS voice lines.
  final String? textToSpeak;

  /// Audio asset path for earcon sounds.
  final String? earconAsset;

  /// Bearing in degrees for spatial audio panning in IN mode.
  final double? bearingDeg;

  final Duration? duration;
  final ManeuverInstruction? maneuverInstruction;
  final DateTime createdAt;

  SonicEvent({
    required this.id,
    required this.type,
    required this.priority,
    this.textToSpeak,
    this.earconAsset,
    this.bearingDeg,
    this.duration,
    this.maneuverInstruction,
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  bool get isUrgent => priority == SonicPriority.urgent;
}
