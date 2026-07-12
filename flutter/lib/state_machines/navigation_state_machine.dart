import 'package:equatable/equatable.dart';
import 'package:riverpod/riverpod.dart';

import '../models/latlng.dart';
import '../models/route_filament.dart';

enum NavigationPhase { idle, starting, navigating, rerouting, arrived, stopped }

class NavigationSnapshot extends Equatable {
  const NavigationSnapshot({
    required this.phase,
    this.location,
    this.destination,
    this.filament,
    required this.speedMps,
    this.headingDeg,
    this.remainingMeters,
    this.etaSec,
    required this.distanceTravelled,
    required this.lastUpdated,
  });

  final NavigationPhase phase;
  final LatLng? location;
  final LatLng? destination;
  final RouteFilament? filament;
  final double speedMps;
  final double? headingDeg;
  final double? remainingMeters;
  final double? etaSec;
  final double distanceTravelled;
  final DateTime lastUpdated;

  NavigationSnapshot copyWith({
    NavigationPhase? phase,
    LatLng? location,
    Object? destination = _sentinel,
    Object? filament = _sentinel,
    double? speedMps,
    Object? headingDeg = _sentinel,
    Object? remainingMeters = _sentinel,
    Object? etaSec = _sentinel,
    double? distanceTravelled,
    DateTime? lastUpdated,
  }) {
    return NavigationSnapshot(
      phase: phase ?? this.phase,
      location: location ?? this.location,
      destination: identical(destination, _sentinel)
          ? this.destination
          : destination as LatLng?,
      filament: identical(filament, _sentinel)
          ? this.filament
          : filament as RouteFilament?,
      speedMps: speedMps ?? this.speedMps,
      headingDeg: identical(headingDeg, _sentinel)
          ? this.headingDeg
          : headingDeg as double?,
      remainingMeters: identical(remainingMeters, _sentinel)
          ? this.remainingMeters
          : remainingMeters as double?,
      etaSec: identical(etaSec, _sentinel) ? this.etaSec : etaSec as double?,
      distanceTravelled: distanceTravelled ?? this.distanceTravelled,
      lastUpdated: lastUpdated ?? this.lastUpdated,
    );
  }

  @override
  List<Object?> get props => [
        phase,
        location,
        destination,
        filament,
        speedMps,
        headingDeg,
        remainingMeters,
        etaSec,
        distanceTravelled,
        lastUpdated,
      ];
}

class NavigationStateMachine extends StateNotifier<NavigationSnapshot> {
  NavigationStateMachine()
      : super(
          NavigationSnapshot(
            phase: NavigationPhase.idle,
            speedMps: 0,
            distanceTravelled: 0,
            lastUpdated: DateTime.now(),
          ),
        );

  static const _emaAlpha = 0.35;
  double? _speedEma;

  void startNavigation(LatLng origin, LatLng destination, RouteFilament filament) {
    _speedEma = 0;
    final remaining = filament.distanceMeters > 0
        ? filament.distanceMeters
        : origin.haversineDistance(destination);
    state = NavigationSnapshot(
      phase: NavigationPhase.starting,
      location: origin,
      destination: destination,
      filament: filament,
      speedMps: 0,
      headingDeg: origin.bearingTo(destination),
      remainingMeters: remaining,
      etaSec: filament.effectiveDurationSec(),
      distanceTravelled: 0,
      lastUpdated: DateTime.now(),
    );
  }

  void updateLocation(LatLng location, {double? speedHint, double? headingHint}) {
    if (state.phase == NavigationPhase.idle ||
        state.phase == NavigationPhase.stopped ||
        state.phase == NavigationPhase.arrived) {
      return;
    }

    final now = DateTime.now();
    final previousLocation = state.location;
    final previousUpdated = state.lastUpdated;
    final segmentDistance = previousLocation?.haversineDistance(location) ?? 0;
    final deltaSeconds = now.difference(previousUpdated).inMilliseconds / 1000;
    final inferredSpeed = deltaSeconds > 0 ? segmentDistance / deltaSeconds : 0;
    final rawSpeed = speedHint ?? inferredSpeed;
    _speedEma = _speedEma == null
        ? rawSpeed
        : ((_emaAlpha * rawSpeed) + ((1 - _emaAlpha) * _speedEma!));

    final travelled = state.distanceTravelled + segmentDistance;
    final routeDistance = state.filament?.distanceMeters ?? travelled;
    final destination = state.destination;
    final geometricRemaining = destination == null
        ? null
        : location.haversineDistance(destination);
    final routeRemaining = (routeDistance - travelled).clamp(0, double.infinity).toDouble();
    final remaining = geometricRemaining == null
        ? routeRemaining
        : geometricRemaining < routeRemaining
            ? geometricRemaining
            : routeRemaining;

    final effectiveDuration = state.filament?.effectiveDurationSec();
    final eta = _estimateEta(remaining, _speedEma ?? 0, routeDistance, effectiveDuration);

    state = state.copyWith(
      phase: NavigationPhase.navigating,
      location: location,
      speedMps: _speedEma,
      headingDeg: headingHint ?? state.headingDeg,
      remainingMeters: remaining,
      etaSec: eta,
      distanceTravelled: travelled,
      lastUpdated: now,
    );
  }

  void updateFilament(RouteFilament filament) {
    final routeDistance = filament.distanceMeters;
    final remaining = (routeDistance - state.distanceTravelled)
        .clamp(0, double.infinity)
        .toDouble();
    state = state.copyWith(
      filament: filament,
      remainingMeters: remaining,
      etaSec: _estimateEta(
        remaining,
        _speedEma ?? state.speedMps,
        routeDistance,
        filament.effectiveDurationSec(),
      ),
      lastUpdated: DateTime.now(),
    );
  }

  void beginReroute() {
    if (state.phase == NavigationPhase.idle || state.phase == NavigationPhase.stopped) {
      return;
    }
    state = state.copyWith(
      phase: NavigationPhase.rerouting,
      lastUpdated: DateTime.now(),
    );
  }

  void commitReroute(RouteFilament newFilament) {
    final remaining = (newFilament.distanceMeters - state.distanceTravelled)
        .clamp(0, double.infinity)
        .toDouble();
    state = state.copyWith(
      phase: NavigationPhase.navigating,
      filament: newFilament,
      remainingMeters: remaining,
      etaSec: _estimateEta(
        remaining,
        _speedEma ?? state.speedMps,
        newFilament.distanceMeters,
        newFilament.effectiveDurationSec(),
      ),
      lastUpdated: DateTime.now(),
    );
  }

  void triggerArrival() {
    state = state.copyWith(
      phase: NavigationPhase.arrived,
      remainingMeters: 0,
      etaSec: 0,
      speedMps: 0,
      lastUpdated: DateTime.now(),
    );
  }

  void stopNavigation() {
    _speedEma = 0;
    state = state.copyWith(
      phase: NavigationPhase.stopped,
      filament: null,
      destination: null,
      remainingMeters: null,
      etaSec: null,
      speedMps: 0,
      headingDeg: null,
      lastUpdated: DateTime.now(),
    );
  }

  DateTime? getEtaAbsolute() {
    if (state.etaSec == null) {
      return null;
    }
    return state.lastUpdated.add(Duration(seconds: state.etaSec!.round()));
  }

  double? _estimateEta(
    double? remainingMeters,
    double speedMps,
    double? routeDistance,
    double? routeDurationSec,
  ) {
    if (remainingMeters == null) {
      return null;
    }
    if (speedMps > 0.5) {
      return remainingMeters / speedMps;
    }
    if (routeDistance != null && routeDistance > 0 && routeDurationSec != null) {
      return routeDurationSec * (remainingMeters / routeDistance);
    }
    return null;
  }
}

const Object _sentinel = Object();
