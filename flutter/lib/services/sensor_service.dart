import 'dart:async';
import 'dart:math' as math;
import '../models/latlng.dart';
import '../models/movement_state.dart';

// ─── SensorData ───────────────────────────────────────────────────────────────

/// A single fused sensor reading snapshot.
class SensorData {
  final DateTime timestamp;
  final double? latitude;
  final double? longitude;
  final double? altitude;
  final double? gnssAccuracyMeters;
  final double? speedMps;
  final double? headingDeg;
  final double? accelX;
  final double? accelY;
  final double? accelZ;
  final double? gyroX;
  final double? gyroY;
  final double? gyroZ;
  final double? magX;
  final double? magY;
  final double? magZ;
  final double? barometerHpa;
  final bool isGnssFixed;
  final double gnssConfidence;

  const SensorData({
    required this.timestamp,
    this.latitude,
    this.longitude,
    this.altitude,
    this.gnssAccuracyMeters,
    this.speedMps,
    this.headingDeg,
    this.accelX,
    this.accelY,
    this.accelZ,
    this.gyroX,
    this.gyroY,
    this.gyroZ,
    this.magX,
    this.magY,
    this.magZ,
    this.barometerHpa,
    this.isGnssFixed = false,
    this.gnssConfidence = 0.0,
  });

  LatLng? get position =>
      latitude != null && longitude != null ? LatLng(latitude!, longitude!) : null;
}

// ─── SensorService ────────────────────────────────────────────────────────────

/// Aggregates device sensors (GNSS, IMU, barometer) into [SensorData] streams.
///
/// On mobile, the actual hardware bindings come from:
///   - `geolocator` for GNSS (position, speed, heading)
///   - `sensors_plus` for accelerometer, gyroscope, magnetometer
///   - `flutter_compass` for magnetic heading
///
/// For desktop/testing, call [startSimulation] to emit synthetic fixes.
class SensorService {
  bool _isRunning = false;
  SensorData? _currentData;
  static const _locationUpdateInterval = Duration(seconds: 1);

  final _dataController = StreamController<SensorData>.broadcast();
  Timer? _simulationTimer;

  // Internal simulation state
  LatLng? _simPosition;
  double _simSpeedMps = 0;
  double _simHeadingDeg = 0;

  // ─── Public API ─────────────────────────────────────────────────────────────

  Future<void> start() async {
    if (_isRunning) return;
    _isRunning = true;

    // Integration point: wire real sensor streams here.
    //
    // Geolocator example:
    //   Geolocator.getPositionStream(locationSettings: ...).listen(_onPosition);
    //
    // sensors_plus example:
    //   accelerometerEventStream().listen(_onAccel);
    //   gyroscopeEventStream().listen(_onGyro);
  }

  void stop() {
    _isRunning = false;
    _simulationTimer?.cancel();
    _simulationTimer = null;
  }

  SensorData? get currentData => _currentData;

  Stream<SensorData> get dataStream => _dataController.stream;

  bool get isRunning => _isRunning;

  /// Exponential decay GNSS confidence: 1.0 at 5 m accuracy, 0 at ~100 m.
  double computeGnssConfidence(double? accuracyMeters) {
    if (accuracyMeters == null) return 0.0;
    const optimalAccuracyM = 5.0;
    const decayRate = 0.04;
    return math
        .exp(-decayRate * (accuracyMeters - optimalAccuracyM).clamp(0, double.infinity))
        .clamp(0.0, 1.0);
  }

  // ─── Simulation ─────────────────────────────────────────────────────────────

  /// Emit synthetic GPS fixes starting from [startPosition], moving at
  /// [speedMps] in the direction of [headingDeg] once per second.
  void startSimulation(
    LatLng startPosition, {
    double speedMps = 10.0,
    double headingDeg = 90.0,
  }) {
    _simPosition = startPosition;
    _simSpeedMps = speedMps;
    _simHeadingDeg = headingDeg;
    _isRunning = true;

    _simulationTimer?.cancel();
    _simulationTimer =
        Timer.periodic(_locationUpdateInterval, (_) => _emitSimulated());
  }

  void stopSimulation() {
    _simulationTimer?.cancel();
    _simulationTimer = null;
  }

  // ─── Permission stub ────────────────────────────────────────────────────────

  /// Request location permissions.
  ///
  /// Integration point: replace with `permission_handler` call:
  /// ```dart
  /// final status = await Permission.locationWhenInUse.request();
  /// return status.isGranted;
  /// ```
  Future<bool> requestPermissions() async => true;

  // ─── Cleanup ────────────────────────────────────────────────────────────────

  void dispose() {
    stop();
    _dataController.close();
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  void _emitSimulated() {
    if (_simPosition == null) return;

    // Advance position by one second of travel.
    final rad = _simHeadingDeg * math.pi / 180;
    final deltaMeters = _simSpeedMps;
    const metresToDeg = 1.0 / 111320.0;
    _simPosition = LatLng(
      _simPosition!.latitude + deltaMeters * metresToDeg * math.cos(rad),
      _simPosition!.longitude + deltaMeters * metresToDeg * math.sin(rad),
    );

    const accuracy = 4.5;
    final data = SensorData(
      timestamp: DateTime.now(),
      latitude: _simPosition!.latitude,
      longitude: _simPosition!.longitude,
      altitude: 25.0,
      gnssAccuracyMeters: accuracy,
      speedMps: _simSpeedMps,
      headingDeg: _simHeadingDeg,
      accelX: 0.1,
      accelY: 9.78,
      accelZ: 0.3,
      gyroX: 0.01,
      gyroY: 0.0,
      gyroZ: 0.02,
      isGnssFixed: true,
      gnssConfidence: computeGnssConfidence(accuracy),
    );

    _currentData = data;
    _dataController.add(data);
  }
}
