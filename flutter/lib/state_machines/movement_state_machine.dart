export '../models/movement_state.dart' show MovementClassification;

import 'package:riverpod/riverpod.dart';

import '../models/movement_state.dart';

class MovementStateMachine extends StateNotifier<MovementState> {
  MovementStateMachine()
      : super(
          MovementState(
            classification: MovementClassification.unknown,
            confidenceScore: 0,
            speedMps: 0,
            isGnssAvailable: false,
            isWifiAvailable: false,
            isBluetoothAvailable: false,
            lastUpdated: DateTime.now(),
          ),
        );

  void updateFromSensors({
    double? speedMps,
    double? headingDeg,
    double? gnssAccuracy,
    bool? gnssAvailable,
    bool? wifiAvailable,
    bool? bluetoothAvailable,
    double? altitude,
    Map<String, double>? sensorWeights,
  }) {
    final mergedWeights = {
      ...state.sensorContributions,
      ...?sensorWeights,
    };
    final nextSpeed = speedMps ?? state.speedMps;
    final nextGnssAvailable = gnssAvailable ?? state.isGnssAvailable;
    final nextWifiAvailable = wifiAvailable ?? state.isWifiAvailable;
    final nextBluetoothAvailable = bluetoothAvailable ?? state.isBluetoothAvailable;
    final nextAccuracy = gnssAccuracy ?? state.gnssAccuracyMeters;

    state = MovementState(
      classification: _classify(nextSpeed, mergedWeights),
      confidenceScore: _computeConfidence(
        gnssAccuracyMeters: nextAccuracy,
        gnssAvailable: nextGnssAvailable,
        sensorWeights: mergedWeights,
      ),
      speedMps: nextSpeed,
      headingDeg: headingDeg ?? state.headingDeg,
      altitude: altitude ?? state.altitude,
      gnssAccuracyMeters: nextAccuracy,
      isGnssAvailable: nextGnssAvailable,
      isWifiAvailable: nextWifiAvailable,
      isBluetoothAvailable: nextBluetoothAvailable,
      lastUpdated: DateTime.now(),
      sensorContributions: mergedWeights,
    );
  }

  MovementClassification _classify(
    double speedMps,
    Map<String, double> sensorWeights,
  ) {
    if (speedMps > 5) {
      return MovementClassification.vehicle;
    }
    if (speedMps < 0.5) {
      return MovementClassification.stationary;
    }

    final accelerometerVariance = sensorWeights['accelerometerVariance'] ??
        sensorWeights['accelerometer'] ??
        0.0;
    if (speedMps > 2.2 || accelerometerVariance > 0.65) {
      return MovementClassification.cycling;
    }
    return MovementClassification.walking;
  }

  double _computeConfidence({
    required double? gnssAccuracyMeters,
    required bool gnssAvailable,
    required Map<String, double> sensorWeights,
  }) {
    final accuracyScore = !gnssAvailable || gnssAccuracyMeters == null
        ? 0.25
        : (1 - (gnssAccuracyMeters / 50)).clamp(0, 1).toDouble();
    final weights = sensorWeights.values
        .map((value) => value.clamp(0, 1).toDouble())
        .toList(growable: false);
    final sensorScore = weights.isEmpty
        ? 0.5
        : weights.reduce((a, b) => a + b) / weights.length;
    return ((accuracyScore * 0.6) + (sensorScore * 0.4)).clamp(0, 1).toDouble();
  }
}
