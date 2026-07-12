import 'latlng.dart';
import 'mode_strand.dart';

enum CrowdingLevel { empty, low, medium, high, crush }

enum FlowType { pedestrian, cycling, microMobility, transit, vehicular, mixed }

class FlowCell {
  const FlowCell({
    required this.id,
    required this.segmentIndex,
    required this.crowdingLevel,
    this.intensity = 0.5,
  });

  final String id;
  final int segmentIndex;
  final CrowdingLevel crowdingLevel;
  final double intensity;
}

class FlowRibbon {
  const FlowRibbon({
    required this.id,
    required this.type,
    required this.mode,
    required this.entityId,
    required this.path,
    required this.cells,
    required this.crowdingLevel,
    required this.updatedAt,
  });

  final String id;
  final FlowType type;
  final TravelMode mode;
  final String entityId;
  final List<LatLng> path;
  final List<FlowCell> cells;
  final CrowdingLevel crowdingLevel;
  final DateTime updatedAt;

  FlowRibbon copyWith({
    String? id,
    FlowType? type,
    TravelMode? mode,
    String? entityId,
    List<LatLng>? path,
    List<FlowCell>? cells,
    CrowdingLevel? crowdingLevel,
    DateTime? updatedAt,
  }) {
    return FlowRibbon(
      id: id ?? this.id,
      type: type ?? this.type,
      mode: mode ?? this.mode,
      entityId: entityId ?? this.entityId,
      path: path ?? this.path,
      cells: cells ?? this.cells,
      crowdingLevel: crowdingLevel ?? this.crowdingLevel,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}
