import 'latlng.dart';

class CameraPose {
  final LatLng? position;
  final double pitch;
  final double bearing;
  final double fov;
  final double zoom;

  const CameraPose({
    required this.position,
    required this.pitch,
    required this.bearing,
    required this.fov,
    required this.zoom,
  });

  CameraPose copyWith({
    LatLng? position,
    double? pitch,
    double? bearing,
    double? fov,
    double? zoom,
  }) {
    return CameraPose(
      position: position ?? this.position,
      pitch: pitch ?? this.pitch,
      bearing: bearing ?? this.bearing,
      fov: fov ?? this.fov,
      zoom: zoom ?? this.zoom,
    );
  }
}
