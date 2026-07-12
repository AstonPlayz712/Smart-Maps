import 'package:equatable/equatable.dart';
import 'package:riverpod/riverpod.dart';

import '../models/mode_strand.dart';
import '../models/place_node.dart';

enum ArrivalPhase { approaching, arrived, celebrating, dismissed }

class RouteSummary extends Equatable {
  RouteSummary({
    required this.distanceMeters,
    required this.durationSec,
    required this.actualDurationSec,
    required List<TravelMode> modesUsed,
  }) : modesUsed = List.unmodifiable(modesUsed);

  final double distanceMeters;
  final double durationSec;
  final double actualDurationSec;
  final List<TravelMode> modesUsed;

  @override
  List<Object?> get props => [
        distanceMeters,
        durationSec,
        actualDurationSec,
        modesUsed,
      ];
}

class ArrivalSnapshot extends Equatable {
  const ArrivalSnapshot({
    required this.phase,
    this.destination,
    this.arrivedAt,
    this.routeSummary,
  });

  final ArrivalPhase phase;
  final PlaceNode? destination;
  final DateTime? arrivedAt;
  final RouteSummary? routeSummary;

  ArrivalSnapshot copyWith({
    ArrivalPhase? phase,
    Object? destination = _sentinel,
    Object? arrivedAt = _sentinel,
    Object? routeSummary = _sentinel,
  }) {
    return ArrivalSnapshot(
      phase: phase ?? this.phase,
      destination: identical(destination, _sentinel)
          ? this.destination
          : destination as PlaceNode?,
      arrivedAt: identical(arrivedAt, _sentinel)
          ? this.arrivedAt
          : arrivedAt as DateTime?,
      routeSummary: identical(routeSummary, _sentinel)
          ? this.routeSummary
          : routeSummary as RouteSummary?,
    );
  }

  @override
  List<Object?> get props => [phase, destination, arrivedAt, routeSummary];
}

class ArrivalStateMachine extends StateNotifier<ArrivalSnapshot> {
  ArrivalStateMachine()
      : super(const ArrivalSnapshot(phase: ArrivalPhase.dismissed));

  void triggerApproaching(PlaceNode destination) {
    state = ArrivalSnapshot(
      phase: ArrivalPhase.approaching,
      destination: destination,
    );
  }

  void triggerArrival(PlaceNode destination, RouteSummary summary) {
    state = ArrivalSnapshot(
      phase: ArrivalPhase.arrived,
      destination: destination,
      arrivedAt: DateTime.now(),
      routeSummary: summary,
    );
  }

  void celebrate() {
    if (state.phase != ArrivalPhase.arrived) {
      return;
    }
    state = state.copyWith(phase: ArrivalPhase.celebrating);
  }

  void dismiss() {
    state = const ArrivalSnapshot(phase: ArrivalPhase.dismissed);
  }
}

const Object _sentinel = Object();
