import 'dart:async';

import 'package:equatable/equatable.dart';
import 'package:riverpod/riverpod.dart';

import '../models/disruption_node.dart';
import '../models/route_filament.dart';

enum DisruptionPhase {
  clear,
  detected,
  pendingReroute,
  vetoed,
  rerouting,
  committed,
}

class DisruptionSnapshot extends Equatable {
  const DisruptionSnapshot({
    required this.phase,
    this.activeDisruption,
    this.proposedFilament,
    this.vetoWindowEndsAt,
    required this.isVetoed,
    required this.reroutes,
  });

  final DisruptionPhase phase;
  final DisruptionNode? activeDisruption;
  final RouteFilament? proposedFilament;
  final DateTime? vetoWindowEndsAt;
  final bool isVetoed;
  final int reroutes;

  DisruptionSnapshot copyWith({
    DisruptionPhase? phase,
    Object? activeDisruption = _sentinel,
    Object? proposedFilament = _sentinel,
    Object? vetoWindowEndsAt = _sentinel,
    bool? isVetoed,
    int? reroutes,
  }) {
    return DisruptionSnapshot(
      phase: phase ?? this.phase,
      activeDisruption: identical(activeDisruption, _sentinel)
          ? this.activeDisruption
          : activeDisruption as DisruptionNode?,
      proposedFilament: identical(proposedFilament, _sentinel)
          ? this.proposedFilament
          : proposedFilament as RouteFilament?,
      vetoWindowEndsAt: identical(vetoWindowEndsAt, _sentinel)
          ? this.vetoWindowEndsAt
          : vetoWindowEndsAt as DateTime?,
      isVetoed: isVetoed ?? this.isVetoed,
      reroutes: reroutes ?? this.reroutes,
    );
  }

  @override
  List<Object?> get props => [
        phase,
        activeDisruption,
        proposedFilament,
        vetoWindowEndsAt,
        isVetoed,
        reroutes,
      ];
}

class DisruptionStateMachine extends StateNotifier<DisruptionSnapshot> {
  DisruptionStateMachine()
      : super(
          const DisruptionSnapshot(
            phase: DisruptionPhase.clear,
            isVetoed: false,
            reroutes: 0,
          ),
        );

  Timer? _vetoTimer;

  void detectDisruption(DisruptionNode node, RouteFilament proposedAlternate) {
    _vetoTimer?.cancel();
    final vetoEndsAt = DateTime.now().add(const Duration(seconds: 8));
    state = DisruptionSnapshot(
      phase: DisruptionPhase.pendingReroute,
      activeDisruption: node,
      proposedFilament: proposedAlternate,
      vetoWindowEndsAt: vetoEndsAt,
      isVetoed: false,
      reroutes: state.reroutes,
    );
    _vetoTimer = Timer(const Duration(seconds: 8), _vetoWindowExpired);
  }

  void veto() {
    if (state.phase != DisruptionPhase.pendingReroute) {
      return;
    }
    _vetoTimer?.cancel();
    state = state.copyWith(
      phase: DisruptionPhase.vetoed,
      isVetoed: true,
      vetoWindowEndsAt: null,
    );
  }

  void commitReroute() {
    if (state.phase != DisruptionPhase.pendingReroute || state.isVetoed) {
      return;
    }
    _vetoTimer?.cancel();
    state = state.copyWith(phase: DisruptionPhase.rerouting, vetoWindowEndsAt: null);
    state = state.copyWith(
      phase: DisruptionPhase.committed,
      reroutes: state.reroutes + 1,
    );
  }

  void clearDisruption() {
    _vetoTimer?.cancel();
    state = DisruptionSnapshot(
      phase: DisruptionPhase.clear,
      isVetoed: false,
      reroutes: state.reroutes,
    );
  }

  void _vetoWindowExpired() {
    if (state.phase == DisruptionPhase.pendingReroute && !state.isVetoed) {
      commitReroute();
    }
  }

  @override
  void dispose() {
    _vetoTimer?.cancel();
    super.dispose();
  }
}

const Object _sentinel = Object();
