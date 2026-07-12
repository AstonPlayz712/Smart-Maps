import 'latlng.dart';

enum DisruptionType {
  accident,
  closure,
  congestion,
  construction,
  hazard,
  transitDelay,
  weather,
}

enum DisruptionSeverity { low, medium, high, critical }

class DisruptionNode {
  DisruptionNode({
    required this.id,
    LatLng? coordinate,
    LatLng? location,
    this.type = DisruptionType.hazard,
    this.severity = DisruptionSeverity.medium,
    String? summary,
    String? description,
    this.radiusMeters = 100.0,
    this.frictionAddedSec = 0,
    this.isBlocking = false,
    DateTime? createdAt,
  })  : coordinate = coordinate ?? location ?? const LatLng(0, 0),
        summary = summary ?? description ?? '',
        description = description ?? summary ?? '',
        createdAt = createdAt ?? DateTime.now();

  final String id;
  final LatLng coordinate;
  final DisruptionType type;
  final DisruptionSeverity severity;
  final String summary;
  final String description;
  final double radiusMeters;
  final double frictionAddedSec;
  final bool isBlocking;
  final DateTime createdAt;

  LatLng get location => coordinate;
}
