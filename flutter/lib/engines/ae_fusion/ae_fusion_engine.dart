import 'dart:async';
import 'dart:collection';
import 'dart:math';

import '../../models/latlng.dart';
import '../../models/movement_state.dart';

class SensorReading {
  const SensorReading({
    required this.timestamp,
    this.gnssPosition,
    this.gnssAccuracyMeters,
    this.gnssSpeedMps,
    this.gnssHeadingDeg,
    this.accelerometerX,
    this.accelerometerY,
    this.accelerometerZ,
    this.gyroscopeX,
    this.gyroscopeY,
    this.gyroscopeZ,
    this.magnetometerX,
    this.magnetometerY,
    this.magnetometerZ,
    this.barometerHpa,
    this.wifiRssi,
    this.bluetoothRssi,
    this.altitude,
  });

  final DateTime timestamp;
  final LatLng? gnssPosition;
  final double? gnssAccuracyMeters;
  final double? gnssSpeedMps;
  final double? gnssHeadingDeg;
  final double? accelerometerX;
  final double? accelerometerY;
  final double? accelerometerZ;
  final double? gyroscopeX;
  final double? gyroscopeY;
  final double? gyroscopeZ;
  final double? magnetometerX;
  final double? magnetometerY;
  final double? magnetometerZ;
  final double? barometerHpa;
  final Map<String, int>? wifiRssi;
  final Map<String, int>? bluetoothRssi;
  final double? altitude;
}

class AEFusionEngine {
  final Queue<SensorReading> _readings = ListQueue<SensorReading>();
  MovementState _currentState = MovementState(
    classification: MovementClassification.unknown,
    confidence: 0,
    timestamp: DateTime.fromMillisecondsSinceEpoch(0),
    reason: 'No readings available.',
  );
  double _gnssWeight = 0.5;
  double _accelWeight = 0.25;
  double _gyroWeight = 0.15;
  double _wifiWeight = 0.05;
  double _btWeight = 0.05;
  final StreamController<MovementState> _stateUpdates =
      StreamController<MovementState>.broadcast();

  void ingestReading(SensorReading reading) {
    _readings.addLast(reading);
    while (_readings.length > 50) {
      _readings.removeFirst();
    }

    final nextState = classify();
    final stateChanged = nextState.classification != _currentState.classification ||
        (nextState.confidence - _currentState.confidence).abs() > 0.05 ||
        nextState.isIndoor != _currentState.isIndoor;
    _currentState = nextState;
    if (stateChanged) {
      _stateUpdates.add(nextState);
    }
  }

  MovementState classify() {
    if (_readings.isEmpty) {
      return _currentState;
    }
    final reading = _readings.last;
    final accelMagnitude = _accelMagnitude(reading);
    final accelVariance = _accelVariance();
    final gyroVariance = _gyroVariance();
    final speed = reading.gnssSpeedMps;
    final hasIndoorSignals =
        (reading.wifiRssi?.isNotEmpty ?? false) || (reading.bluetoothRssi?.isNotEmpty ?? false);
    final indoorLikely = hasIndoorSignals &&
        (reading.gnssAccuracyMeters == null || reading.gnssAccuracyMeters! > 20);

    var classification = MovementClassification.unknown;
    var reason = 'Insufficient sensor agreement.';

    if (speed != null) {
      if (speed > 5.0 && accelVariance > 0.35) {
        classification = MovementClassification.vehicle;
        reason = 'GNSS speed and accelerometer variance indicate vehicle travel.';
      } else if (speed >= 0.5 && speed <= 5.0) {
        if (gyroVariance > 0.6) {
          classification = MovementClassification.cycling;
          reason = 'Moderate GNSS speed with elevated gyro variance indicates cycling.';
        } else {
          classification = MovementClassification.walking;
          reason = 'Moderate GNSS speed with stable gyro signature indicates walking.';
        }
      } else if (speed < 0.5 || (accelMagnitude - 9.81).abs() < 0.9) {
        classification = MovementClassification.stationary;
        reason = 'Low GNSS speed and low dynamic acceleration indicate stationary behavior.';
      }
    } else {
      if ((accelMagnitude - 9.81).abs() < 0.7 && accelVariance < 0.15) {
        classification = MovementClassification.stationary;
        reason = 'Accelerometer stays near gravity with minimal variance.';
      } else if (gyroVariance > 0.75 && accelVariance > 0.45) {
        classification = MovementClassification.cycling;
        reason = 'High gyro and accelerometer variance without GNSS matches cycling.';
      } else if (accelVariance > 0.2) {
        classification = MovementClassification.walking;
        reason = 'Step-like accelerometer variance indicates walking.';
      }
    }

    final confidence = _clamp01(_computeConfidence(reading));
    return MovementState(
      classification: classification,
      confidence: confidence,
      timestamp: reading.timestamp,
      reason: reason,
      position: reading.gnssPosition,
      speedMps: speed,
      headingDeg: reading.gnssHeadingDeg,
      isIndoor: indoorLikely,
    );
  }

  double _computeConfidence(SensorReading reading) {
    final gnssConfidence = reading.gnssAccuracyMeters == null ? 0.25 : _gnssConfidence(reading);
    final accelConfidence =
        reading.accelerometerX != null && reading.accelerometerY != null && reading.accelerometerZ != null
            ? (1.0 - min(1.0, _accelVariance()))
            : 0.0;
    final gyroConfidence =
        reading.gyroscopeX != null && reading.gyroscopeY != null && reading.gyroscopeZ != null
            ? (1.0 - min(1.0, _gyroVariance() / 2.0))
            : 0.0;
    final wifiConfidence = (reading.wifiRssi?.isNotEmpty ?? false) ? 0.65 : 0.0;
    final btConfidence = (reading.bluetoothRssi?.isNotEmpty ?? false) ? 0.55 : 0.0;
    final sensorCoverage = [
          reading.gnssPosition != null || reading.gnssSpeedMps != null,
          reading.accelerometerX != null && reading.accelerometerY != null && reading.accelerometerZ != null,
          reading.gyroscopeX != null && reading.gyroscopeY != null && reading.gyroscopeZ != null,
          reading.wifiRssi?.isNotEmpty ?? false,
          reading.bluetoothRssi?.isNotEmpty ?? false,
        ].where((present) => present).length /
        5.0;

    final weighted = (gnssConfidence * _gnssWeight) +
        (accelConfidence * _accelWeight) +
        (gyroConfidence * _gyroWeight) +
        (wifiConfidence * _wifiWeight) +
        (btConfidence * _btWeight);
    return (weighted * 0.8) + (sensorCoverage * 0.2);
  }

  double _accelMagnitude(SensorReading r) {
    final x = r.accelerometerX ?? 0.0;
    final y = r.accelerometerY ?? 0.0;
    final z = r.accelerometerZ ?? 0.0;
    return sqrt((x * x) + (y * y) + (z * z));
  }

  double _accelVariance() {
    if (_readings.length < 2) {
      return 0.0;
    }
    final magnitudes = _readings.map(_accelMagnitude).toList(growable: false);
    final mean = magnitudes.reduce((a, b) => a + b) / magnitudes.length;
    final squared = magnitudes.fold<double>(0.0, (sum, value) {
      final delta = value - mean;
      return sum + (delta * delta);
    });
    return squared / magnitudes.length;
  }

  double _gnssConfidence(SensorReading r) {
    final accuracy = r.gnssAccuracyMeters ?? 100.0;
    return 1.0 / (1.0 + (accuracy / 10.0));
  }

  void updateSensorWeights(Map<String, double> weights) {
    _gnssWeight = weights['gnss'] ?? _gnssWeight;
    _accelWeight = weights['accel'] ?? _accelWeight;
    _gyroWeight = weights['gyro'] ?? _gyroWeight;
    _wifiWeight = weights['wifi'] ?? _wifiWeight;
    _btWeight = weights['bt'] ?? _btWeight;

    final total = _gnssWeight + _accelWeight + _gyroWeight + _wifiWeight + _btWeight;
    if (total <= 0) {
      _gnssWeight = 0.5;
      _accelWeight = 0.25;
      _gyroWeight = 0.15;
      _wifiWeight = 0.05;
      _btWeight = 0.05;
      return;
    }
    _gnssWeight /= total;
    _accelWeight /= total;
    _gyroWeight /= total;
    _wifiWeight /= total;
    _btWeight /= total;
  }

  MovementState get currentState => _currentState;

  Stream<MovementState> get stateUpdates => _stateUpdates.stream;

  void dispose() {
    _stateUpdates.close();
    _readings.clear();
  }

  double _gyroVariance() {
    final readings = _readings.where((reading) {
      return reading.gyroscopeX != null &&
          reading.gyroscopeY != null &&
          reading.gyroscopeZ != null;
    }).toList(growable: false);
    if (readings.length < 2) {
      return 0.0;
    }
    final magnitudes = readings
        .map((reading) => sqrt(
              pow(reading.gyroscopeX!, 2) +
                  pow(reading.gyroscopeY!, 2) +
                  pow(reading.gyroscopeZ!, 2),
            ))
        .toList(growable: false);
    final mean = magnitudes.reduce((a, b) => a + b) / magnitudes.length;
    final squared = magnitudes.fold<double>(0.0, (sum, value) {
      final delta = value - mean;
      return sum + (delta * delta);
    });
    return squared / magnitudes.length;
  }

  double _clamp01(double value) => value.clamp(0.0, 1.0).toDouble();
}
