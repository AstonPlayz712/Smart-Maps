import 'latlng.dart';

enum MovementClassification { unknown, stationary, walking, cycling, vehicle, transit }

class MovementState {
  MovementState({
    required this.classification,
    this.confidence = 0,
    double? confidenceScore,
    DateTime? timestamp,
    DateTime? lastUpdated,
    this.reason = '',
    this.position,
    this.speedMps = 0,
    this.headingDeg,
    this.altitude,
    this.gnssAccuracyMeters,
    this.isIndoor = false,
    this.isGnssAvailable = false,
    this.isWifiAvailable = false,
    this.isBluetoothAvailable = false,
    this.sensorContributions = const <String, double>{},
  })  : confidenceScore = confidenceScore ?? confidence,
        lastUpdated = lastUpdated ?? timestamp ?? DateTime.now(),
        timestamp = timestamp ?? lastUpdated ?? DateTime.now();

  final MovementClassification classification;
  final double confidence;
  final double confidenceScore;
  final DateTime timestamp;
  final DateTime lastUpdated;
  final String reason;
  final LatLng? position;
  final double speedMps;
  final double? headingDeg;
  final double? altitude;
  final double? gnssAccuracyMeters;
  final bool isIndoor;
  final bool isGnssAvailable;
  final bool isWifiAvailable;
  final bool isBluetoothAvailable;
  final Map<String, double> sensorContributions;

  MovementState copyWith({
    MovementClassification? classification,
    double? confidence,
    double? confidenceScore,
    DateTime? timestamp,
    DateTime? lastUpdated,
    String? reason,
    Object? position = _sentinel,
    double? speedMps,
    Object? headingDeg = _sentinel,
    Object? altitude = _sentinel,
    Object? gnssAccuracyMeters = _sentinel,
    bool? isIndoor,
    bool? isGnssAvailable,
    bool? isWifiAvailable,
    bool? isBluetoothAvailable,
    Map<String, double>? sensorContributions,
  }) {
    return MovementState(
      classification: classification ?? this.classification,
      confidence: confidence ?? this.confidence,
      confidenceScore: confidenceScore ?? this.confidenceScore,
      timestamp: timestamp ?? this.timestamp,
      lastUpdated: lastUpdated ?? this.lastUpdated,
      reason: reason ?? this.reason,
      position: identical(position, _sentinel) ? this.position : position as LatLng?,
      speedMps: speedMps ?? this.speedMps,
      headingDeg: identical(headingDeg, _sentinel)
          ? this.headingDeg
          : headingDeg as double?,
      altitude: identical(altitude, _sentinel) ? this.altitude : altitude as double?,
      gnssAccuracyMeters: identical(gnssAccuracyMeters, _sentinel)
          ? this.gnssAccuracyMeters
          : gnssAccuracyMeters as double?,
      isIndoor: isIndoor ?? this.isIndoor,
      isGnssAvailable: isGnssAvailable ?? this.isGnssAvailable,
      isWifiAvailable: isWifiAvailable ?? this.isWifiAvailable,
      isBluetoothAvailable: isBluetoothAvailable ?? this.isBluetoothAvailable,
      sensorContributions: sensorContributions ?? this.sensorContributions,
    );
  }
}

const Object _sentinel = Object();
