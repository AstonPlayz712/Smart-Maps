import 'latlng.dart';

class Gate {
  const Gate({
    required this.id,
    LatLng? coordinate,
    LatLng? location,
    this.approachBearing = 0,
    String? label,
    String? name,
    this.isEntry = false,
    this.pathIndex,
  })  : coordinate = coordinate ?? location ?? const LatLng(0, 0),
        label = label ?? name ?? 'Junction',
        name = name ?? label ?? 'Junction';

  final String id;
  final LatLng coordinate;
  final double approachBearing;
  final String label;
  final String name;
  final bool isEntry;
  final int? pathIndex;

  LatLng get location => coordinate;
}
