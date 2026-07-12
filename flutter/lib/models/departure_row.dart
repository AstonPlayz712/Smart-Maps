class DepartureRow {
  const DepartureRow({
    required this.id,
    required this.lineId,
    required this.destinationLabel,
    required this.departureTime,
    this.platformId,
    this.delayMinutes = 0,
  });

  final String id;
  final String lineId;
  final String destinationLabel;
  final DateTime departureTime;
  final String? platformId;
  final int delayMinutes;
}
