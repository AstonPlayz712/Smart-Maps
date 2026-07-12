import 'latlng.dart';

class PlaceNode {
  const PlaceNode({
    required this.id,
    required this.name,
    LatLng? coordinate,
    LatLng? position,
    this.category,
    this.metadata = const <String, Object?>{},
  }) : coordinate = coordinate ?? position ?? const LatLng(0, 0);

  final String id;
  final String name;
  final LatLng coordinate;
  final String? category;
  final Map<String, Object?> metadata;

  LatLng get position => coordinate;
}
