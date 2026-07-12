import '../../models/camera_pose.dart';
import '../../models/gate.dart';
import '../../models/latlng.dart';

enum INBehaviourMode { driving, walking, cycling }

class INCamera {
  double pitch = 60.0;
  double fov = 65.0;
  double zoom = 16.0;
  double bearing = 0.0;
  LatLng? position;
  double _targetPitch = 60.0;
  double _targetFov = 65.0;
  bool _isFreeLook = false;

  CameraPose compute(
    LatLng userPosition,
    double headingDeg,
    double speedMps,
    INBehaviourMode mode,
  ) {
    position = userPosition;
    if (_isFreeLook) {
      return currentPose;
    }

    switch (mode) {
      case INBehaviourMode.driving:
        _targetPitch = 60.0;
        _targetFov = speedMps > 30.0 ? 80.0 : 65.0;
        zoom = speedMps > 30.0 ? 15.2 : 16.2;
        break;
      case INBehaviourMode.walking:
        _targetPitch = 40.0;
        _targetFov = 60.0;
        zoom = 17.6;
        break;
      case INBehaviourMode.cycling:
        _targetPitch = 50.0;
        _targetFov = 62.0;
        zoom = 16.8;
        break;
    }

    bearing = _normalizeBearing(headingDeg);
    _interpolate(_targetPitch, _targetFov, 0.18);
    return currentPose;
  }

  CameraPose computeAtJunction(Gate gate, INBehaviourMode mode) {
    if (!_isFreeLook) {
      bearing = _normalizeBearing(gate.approachBearing);
    }
    position = gate.coordinate;
    _targetPitch = 75.0;
    _targetFov = 55.0;
    _interpolate(_targetPitch, _targetFov, 0.28);
    zoom = switch (mode) {
      INBehaviourMode.driving => 16.8,
      INBehaviourMode.walking => 18.2,
      INBehaviourMode.cycling => 17.4,
    };
    return currentPose;
  }

  void enterFreeLook() {
    _isFreeLook = true;
  }

  void exitFreeLook() {
    _isFreeLook = false;
  }

  bool get isFreeLook => _isFreeLook;

  CameraPose snapToRoute(LatLng position, double headingDeg) {
    _isFreeLook = false;
    this.position = position;
    bearing = _normalizeBearing(headingDeg);
    _interpolate(_targetPitch, _targetFov, 0.45);
    return currentPose;
  }

  CameraPose get currentPose => CameraPose(
        position: position,
        pitch: pitch,
        bearing: bearing,
        fov: fov,
        zoom: zoom,
      );

  void _interpolate(double targetPitch, double targetFov, double t) {
    final factor = t.clamp(0.0, 1.0).toDouble();
    pitch += (targetPitch - pitch) * factor;
    fov += (targetFov - fov) * factor;
  }

  double _normalizeBearing(double value) => (value % 360 + 360) % 360;
}
