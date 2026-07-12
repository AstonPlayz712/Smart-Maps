import 'flow_ribbon.dart' show CrowdingLevel;

/// A single departure entry shown in a transit departure board.
class DepartureRow {
  const DepartureRow({
    required this.id,
    required this.transitLineId,
    required this.lineName,
    required this.lineColour,
    required this.destination,
    this.platformId,
    this.platformNumber,
    required this.scheduledDeparture,
    this.realtimeDeparture,
    this.isRealTime = false,
    this.isCancelled = false,
    required this.crowdingLevel,
    this.vehicleId,
    required this.stopSequence,
  });

  final String id;
  final String transitLineId;
  final String lineName;

  /// ARGB integer colour for the line.
  final int lineColour;

  final String destination;
  final String? platformId;
  final String? platformNumber;
  final DateTime scheduledDeparture;
  final DateTime? realtimeDeparture;
  final bool isRealTime;
  final bool isCancelled;
  final CrowdingLevel crowdingLevel;
  final String? vehicleId;
  final int stopSequence;

  // ─── Derived ─────────────────────────────────────────────────────────────────

  /// The best departure time to show the user.
  DateTime get effectiveDeparture => realtimeDeparture ?? scheduledDeparture;

  /// Delay in minutes (negative = early).
  int get delayMinutes {
    if (realtimeDeparture == null) return 0;
    return realtimeDeparture!.difference(scheduledDeparture).inMinutes;
  }

  bool get isOnTime => delayMinutes <= 0;
}
