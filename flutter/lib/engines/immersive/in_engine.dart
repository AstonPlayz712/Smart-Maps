import '../../models/camera_pose.dart';
import '../../models/gate.dart';
import '../../models/in_behaviour_mode.dart';
import '../../models/latlng.dart';
import 'in_callouts.dart';
import 'in_camera.dart';

enum INPhase { inactive, entering, active, atJunction, exiting, degraded }

class ImmersiveNavigationEngine {
  INPhase _phase = INPhase.inactive;
  final INCamera _camera = INCamera();
  final INCallouts _callouts = INCallouts();
  INBehaviourMode _behaviourMode = INBehaviourMode.driving;
  LatLng? _destination;
  Gate? _currentGate;
  bool _gpsDegraded = false;
  DateTime? _enteredAt;
  double _speedMps = 0.0;

  void enter(LatLng destination, INBehaviourMode mode) {
    if (_phase != INPhase.inactive) {
      exit();
    }
    _destination = destination;
    _behaviourMode = mode;
    _currentGate = null;
    _gpsDegraded = false;
    _enteredAt = DateTime.now();
    _speedMps = 0.0;
    _callouts.clear();
    _callouts.addDestinationCallout(destination, 'Destination');
    _transitionPhase(INPhase.entering);
    _transitionPhase(INPhase.active);
  }

  void update(LatLng position, double speedMps, double? headingDeg) {
    if (!isActive) {
      return;
    }

    _speedMps = speedMps;
    _onSpeedChanged(speedMps);
    final heading = headingDeg ?? _camera.bearing;

    if (_phase == INPhase.atJunction && _currentGate != null) {
      _camera.computeAtJunction(_currentGate!, _behaviourMode);
      if (position.distanceTo(_currentGate!.coordinate) > 35.0) {
        leaveJunction();
      }
    } else {
      _camera.compute(position, heading, speedMps, _behaviourMode);
      if (_currentGate != null &&
          position.distanceTo(_currentGate!.coordinate) <= 45.0 &&
          _phase == INPhase.active) {
        _transitionPhase(INPhase.atJunction);
        _camera.computeAtJunction(_currentGate!, _behaviourMode);
      }
    }

    _callouts.updateVisibility(position, _camera.bearing, _camera.fov);

    if (_destination != null && position.distanceTo(_destination!) <= 25.0) {
      exit();
    }
  }

  void approachJunction(Gate gate) {
    if (!isActive) {
      return;
    }
    _currentGate = gate;
    _callouts.addGateCallout(gate);
    _transitionPhase(INPhase.atJunction);
    _camera.computeAtJunction(gate, _behaviourMode);
    _callouts.updateVisibility(
      _camera.position ?? gate.coordinate,
      _camera.bearing,
      _camera.fov,
    );
  }

  void leaveJunction() {
    if (_phase != INPhase.atJunction) {
      return;
    }
    if (_currentGate != null) {
      _callouts.removeCallout(_currentGate!.id);
    }
    _currentGate = null;
    _transitionPhase(INPhase.active);
  }

  void markGpsDegraded() {
    if (_phase == INPhase.active ||
        _phase == INPhase.atJunction ||
        _phase == INPhase.entering) {
      _gpsDegraded = true;
      _transitionPhase(INPhase.degraded);
      _callouts.clear();
      _currentGate = null;
      _transitionPhase(INPhase.exiting);
      _destination = null;
      _enteredAt = null;
      _speedMps = 0.0;
      _gpsDegraded = false;
      _transitionPhase(INPhase.inactive);
    }
  }

  void exit() {
    if (_phase == INPhase.inactive) {
      return;
    }
    _transitionPhase(INPhase.exiting);
    _callouts.clear();
    _destination = null;
    _currentGate = null;
    _gpsDegraded = false;
    _enteredAt = null;
    _speedMps = 0.0;
    _transitionPhase(INPhase.inactive);
  }

  CameraPose getCurrentCameraPose() => _camera.currentPose;

  List<INCallout> getActiveCallouts() => _callouts.visible;

  Gate? getCurrentGate() => _currentGate;

  bool get isActive => _phase != INPhase.inactive && _phase != INPhase.exiting;

  INPhase get phase => _phase;

  void _transitionPhase(INPhase next) {
    final allowed = switch (_phase) {
      INPhase.inactive => {INPhase.inactive, INPhase.entering},
      INPhase.entering => {INPhase.active, INPhase.exiting, INPhase.degraded},
      INPhase.active => {INPhase.atJunction, INPhase.exiting, INPhase.degraded},
      INPhase.atJunction => {INPhase.active, INPhase.exiting, INPhase.degraded},
      INPhase.degraded => {INPhase.exiting, INPhase.inactive},
      INPhase.exiting => {INPhase.inactive},
    };
    if (!allowed.contains(next) || _phase == next) {
      return;
    }
    _phase = next;
  }

  void _onSpeedChanged(double speedMps) {
    if (_camera.isFreeLook) {
      return;
    }
    final targetFov = switch (_behaviourMode) {
      INBehaviourMode.driving => speedMps > 30.0 ? 80.0 : 65.0,
      INBehaviourMode.walking => 60.0,
      INBehaviourMode.cycling => 62.0,
    };
    _camera.fov += (targetFov - _camera.fov) * 0.12;
  }
}
