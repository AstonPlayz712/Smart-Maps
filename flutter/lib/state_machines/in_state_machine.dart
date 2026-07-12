import 'package:equatable/equatable.dart';
import 'package:riverpod/riverpod.dart';

import '../models/gate.dart';
import '../models/in_behaviour_mode.dart';
import '../models/latlng.dart';

enum INPhase { inactive, entering, active, atJunction, exiting, degraded }

class INState extends Equatable {
  const INState({
    required this.phase,
    required this.cameraPitch,
    required this.cameraFov,
    this.currentGate,
    required this.isFollowing,
    required this.gpsDegraded,
    this.enteredAt,
    required this.speedMps,
    required this.behaviourMode,
  });

  final INPhase phase;
  final double cameraPitch;
  final double cameraFov;
  final Gate? currentGate;
  final bool isFollowing;
  final bool gpsDegraded;
  final DateTime? enteredAt;
  final double speedMps;
  final INBehaviourMode behaviourMode;

  INState copyWith({
    INPhase? phase,
    double? cameraPitch,
    double? cameraFov,
    Object? currentGate = _sentinel,
    bool? isFollowing,
    bool? gpsDegraded,
    Object? enteredAt = _sentinel,
    double? speedMps,
    INBehaviourMode? behaviourMode,
  }) {
    return INState(
      phase: phase ?? this.phase,
      cameraPitch: cameraPitch ?? this.cameraPitch,
      cameraFov: cameraFov ?? this.cameraFov,
      currentGate:
          identical(currentGate, _sentinel) ? this.currentGate : currentGate as Gate?,
      isFollowing: isFollowing ?? this.isFollowing,
      gpsDegraded: gpsDegraded ?? this.gpsDegraded,
      enteredAt:
          identical(enteredAt, _sentinel) ? this.enteredAt : enteredAt as DateTime?,
      speedMps: speedMps ?? this.speedMps,
      behaviourMode: behaviourMode ?? this.behaviourMode,
    );
  }

  @override
  List<Object?> get props => [
        phase,
        cameraPitch,
        cameraFov,
        currentGate,
        isFollowing,
        gpsDegraded,
        enteredAt,
        speedMps,
        behaviourMode,
      ];
}

class INStateMachine extends StateNotifier<INState> {
  INStateMachine()
      : super(
          const INState(
            phase: INPhase.inactive,
            cameraPitch: 60,
            cameraFov: 55,
            isFollowing: false,
            gpsDegraded: false,
            speedMps: 0,
            behaviourMode: INBehaviourMode.driving,
          ),
        );

  LatLng? _destination;

  void enter(INBehaviourMode mode, LatLng destination) {
    _destination = destination;
    state = INState(
      phase: INPhase.entering,
      cameraPitch: _defaultPitch(mode),
      cameraFov: _defaultFov(0, atJunction: false),
      isFollowing: true,
      gpsDegraded: false,
      enteredAt: DateTime.now(),
      speedMps: 0,
      behaviourMode: mode,
    );
    state = state.copyWith(phase: INPhase.active);
  }

  void approachJunction(Gate gate) {
    if (state.phase == INPhase.inactive || state.phase == INPhase.degraded) {
      return;
    }
    state = state.copyWith(
      phase: INPhase.atJunction,
      currentGate: gate,
      cameraPitch: 75,
      cameraFov: _defaultFov(state.speedMps, atJunction: true),
      isFollowing: true,
    );
  }

  void leaveJunction() {
    if (state.phase != INPhase.atJunction) {
      return;
    }
    state = state.copyWith(
      phase: state.gpsDegraded ? INPhase.degraded : INPhase.active,
      currentGate: null,
      cameraPitch: _defaultPitch(state.behaviourMode),
      cameraFov: _defaultFov(state.speedMps, atJunction: false),
    );
  }

  void updateCamera(double pitch, double fov) {
    state = state.copyWith(
      cameraPitch: pitch,
      cameraFov: fov,
    );
  }

  void updateSpeed(double speedMps) {
    state = state.copyWith(
      speedMps: speedMps,
      cameraFov: _defaultFov(speedMps, atJunction: state.phase == INPhase.atJunction),
    );
  }

  void markGpsDegraded() {
    state = state.copyWith(
      phase: INPhase.degraded,
      gpsDegraded: true,
      currentGate: null,
      isFollowing: false,
    );
  }

  void exit() {
    _destination = null;
    state = state.copyWith(
      phase: INPhase.exiting,
      currentGate: null,
      isFollowing: false,
    );
    state = INState(
      phase: INPhase.inactive,
      cameraPitch: _defaultPitch(state.behaviourMode),
      cameraFov: _defaultFov(0, atJunction: false),
      isFollowing: false,
      gpsDegraded: false,
      speedMps: 0,
      behaviourMode: state.behaviourMode,
    );
  }

  void snapToFreeView() {
    if (state.phase == INPhase.inactive) {
      return;
    }
    state = state.copyWith(
      isFollowing: false,
      cameraPitch: _defaultPitch(state.behaviourMode),
      cameraFov: _defaultFov(state.speedMps, atJunction: false),
    );
  }

  double _defaultPitch(INBehaviourMode mode) => switch (mode) {
        INBehaviourMode.driving => 60,
        INBehaviourMode.walking => 40,
        INBehaviourMode.cycling => 50,
      };

  double _defaultFov(double speedMps, {required bool atJunction}) {
    final base = atJunction ? 70.0 : 55.0;
    return speedMps > 20 ? base + 10 : base;
  }
}

const Object _sentinel = Object();
