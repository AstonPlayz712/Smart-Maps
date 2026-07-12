import 'dart:async';
import 'dart:math';

import 'package:uuid/uuid.dart';

import '../../models/compliance_zone.dart';
import '../../models/flow_ribbon.dart';
import '../../models/latlng.dart';
import '../../models/mode_strand.dart';

final Uuid _uuid = Uuid();

class PredictiveStrip {
  const PredictiveStrip({
    required this.id,
    required this.origin,
    required this.destination,
    required this.generatedAt,
    required this.departureWindows,
    required this.modeRankings,
    required this.compliancePreClearance,
  });

  final String id;
  final LatLng origin;
  final LatLng destination;
  final DateTime generatedAt;
  final List<DepartureWindow> departureWindows;
  final List<ModeRanking> modeRankings;
  final Map<TravelMode, bool> compliancePreClearance;
}

class DepartureWindow {
  const DepartureWindow({
    required this.windowStart,
    required this.windowEnd,
    required this.recommendedMode,
    required this.estimatedDurationSec,
    required this.confidence,
    required this.reason,
  });

  final DateTime windowStart;
  final DateTime windowEnd;
  final TravelMode recommendedMode;
  final double estimatedDurationSec;
  final double confidence;
  final String reason;
}

class ModeRanking {
  const ModeRanking({
    required this.mode,
    required this.rank,
    required this.score,
    required this.estimatedDurationSec,
    required this.estimatedCost,
    required this.crowdingLevel,
    required this.complianceClear,
    required this.reason,
  });

  final TravelMode mode;
  final int rank;
  final double score;
  final double estimatedDurationSec;
  final double? estimatedCost;
  final CrowdingLevel? crowdingLevel;
  final bool complianceClear;
  final String reason;

  ModeRanking copyWith({
    TravelMode? mode,
    int? rank,
    double? score,
    double? estimatedDurationSec,
    double? estimatedCost,
    CrowdingLevel? crowdingLevel,
    bool? complianceClear,
    String? reason,
  }) {
    return ModeRanking(
      mode: mode ?? this.mode,
      rank: rank ?? this.rank,
      score: score ?? this.score,
      estimatedDurationSec: estimatedDurationSec ?? this.estimatedDurationSec,
      estimatedCost: estimatedCost ?? this.estimatedCost,
      crowdingLevel: crowdingLevel ?? this.crowdingLevel,
      complianceClear: complianceClear ?? this.complianceClear,
      reason: reason ?? this.reason,
    );
  }
}

class PredictiveRoutingEngine {
  PredictiveRoutingEngine({
    Map<String, List<double>>? historicalPatterns,
    Map<TravelMode, double>? modeWeights,
  })  : _historicalPatterns = historicalPatterns ?? _defaultHistoricalPatterns(),
        _modeWeights =
            modeWeights ?? {for (final mode in TravelMode.values) mode: 1.0};

  final Map<String, List<double>> _historicalPatterns;
  final Map<TravelMode, double> _modeWeights;

  Future<PredictiveStrip> generateStrip(
    LatLng origin,
    LatLng destination,
    DateTime requestTime,
  ) async {
    final departureWindows =
        calculateDepartureWindows(origin, destination, requestTime, 5);
    final modeRankings = rankModes(origin, destination, requestTime);
    final compliancePreClearance =
        preCheckCompliance(origin, destination, const <ComplianceZone>[]);

    return PredictiveStrip(
      id: _uuid.v4(),
      origin: origin,
      destination: destination,
      generatedAt: requestTime,
      departureWindows: departureWindows,
      modeRankings: modeRankings,
      compliancePreClearance: compliancePreClearance,
    );
  }

  List<ModeRanking> rankModes(LatLng origin, LatLng destination, DateTime time) {
    final distanceMeters = origin.distanceTo(destination);
    final zones = const <ComplianceZone>[];
    final rankings = <ModeRanking>[];

    for (final mode in TravelMode.values) {
      final speedFactor = _speedFactor(mode, time);
      final complianceFactor =
          _complianceFactor(mode, zones, origin, destination);
      final convenienceFactor = _convenienceFactor(mode, distanceMeters);
      final weightedScore = (speedFactor * 0.4) +
          (complianceFactor * 0.3) +
          (convenienceFactor * 0.3);
      final preferenceWeight = _modeWeights[mode] ?? 1.0;
      final score = _clamp01(weightedScore * preferenceWeight);
      final effectiveSpeedMps =
          max(0.8, _baseSpeedMps(mode) * (0.6 + (speedFactor * 0.8)));
      final estimatedDurationSec = distanceMeters / effectiveSpeedMps;
      final crowdingLevel =
          mode == TravelMode.transit ? _estimateTransitCrowding(time) : null;
      final reason = _buildModeReason(
        mode,
        speedFactor,
        complianceFactor,
        convenienceFactor,
        time,
      );

      rankings.add(
        ModeRanking(
          mode: mode,
          rank: 0,
          score: score,
          estimatedDurationSec: estimatedDurationSec,
          estimatedCost: _estimateCost(mode, distanceMeters, estimatedDurationSec),
          crowdingLevel: crowdingLevel,
          complianceClear: complianceFactor >= 0.95,
          reason: reason,
        ),
      );
    }

    rankings.sort((a, b) => b.score.compareTo(a.score));
    return List<ModeRanking>.generate(
      rankings.length,
      (index) => rankings[index].copyWith(rank: index + 1),
    );
  }

  List<DepartureWindow> calculateDepartureWindows(
    LatLng origin,
    LatLng destination,
    DateTime from,
    int count,
  ) {
    final windows = <DepartureWindow>[];
    for (var i = 0; i < count; i++) {
      final windowStart = from.add(Duration(minutes: 15 * i));
      final windowEnd = windowStart.add(const Duration(minutes: 15));
      final rankings = rankModes(origin, destination, windowStart);
      final best = rankings.first;
      final secondScore = rankings.length > 1 ? rankings[1].score : best.score;
      final confidence = _clamp01(best.score + ((best.score - secondScore) * 0.5));
      windows.add(
        DepartureWindow(
          windowStart: windowStart,
          windowEnd: windowEnd,
          recommendedMode: best.mode,
          estimatedDurationSec: best.estimatedDurationSec,
          confidence: confidence,
          reason: _buildWindowReason(best.mode, windowStart, best.reason),
        ),
      );
    }
    return windows;
  }

  Map<TravelMode, bool> preCheckCompliance(
    LatLng origin,
    LatLng destination,
    List<ComplianceZone> zones,
  ) {
    return {
      for (final mode in TravelMode.values)
        mode: _complianceFactor(mode, zones, origin, destination) >= 0.95,
    };
  }

  double _speedFactor(TravelMode mode, DateTime time) {
    final profile = _historicalPatterns[mode.name] ?? const <double>[];
    if (profile.isEmpty) {
      return 0.7;
    }
    final hour = time.hour % profile.length;
    final value = profile[hour];
    return _clamp01(value);
  }

  double _complianceFactor(
    TravelMode mode,
    List<ComplianceZone> zones,
    LatLng origin,
    LatLng dest,
  ) {
    if (zones.isEmpty) {
      return 1.0;
    }

    var factor = 1.0;
    final midpoint = LatLng(
      (origin.latitude + dest.latitude) / 2,
      (origin.longitude + dest.longitude) / 2,
      altitude: origin.altitude ?? dest.altitude,
    );

    for (final zone in zones) {
      if (!zone.isActiveAt(DateTime.now())) {
        continue;
      }
      if (!_contains(zone.polygon, origin) &&
          !_contains(zone.polygon, dest) &&
          !_contains(zone.polygon, midpoint)) {
        continue;
      }
      if (!zone.appliesToMode(mode)) {
        continue;
      }
      switch (zone.type) {
        case ComplianceZoneType.lez:
          factor = mode == TravelMode.drive ? min(factor, 0.2) : factor;
          break;
        case ComplianceZoneType.noRideZone:
        case ComplianceZoneType.microMobilityGeofence:
          if (mode == TravelMode.cycle || mode == TravelMode.microMobility) {
            factor = 0.0;
          }
          break;
        case ComplianceZoneType.slowZone:
          factor = min(factor, 0.75);
          break;
        case ComplianceZoneType.autoLimitSpeed:
          factor = min(factor, 0.7);
          break;
        case ComplianceZoneType.congestionCharge:
          factor = mode == TravelMode.drive ? min(factor, 0.5) : factor;
          break;
        case ComplianceZoneType.legalBay:
          // Bays improve convenience — no penalty.
          break;
      }
    }
    return _clamp01(factor);
  }

  double _convenienceFactor(TravelMode mode, double distanceMeters) {
    final distanceKm = distanceMeters / 1000.0;
    switch (mode) {
      case TravelMode.walk:
        if (distanceKm <= 1.2) return 0.98;
        if (distanceKm <= 2.5) return 0.75;
        if (distanceKm <= 5.0) return 0.35;
        return 0.1;
      case TravelMode.cycle:
        if (distanceKm <= 1.0) return 0.55;
        if (distanceKm <= 6.0) return 0.95;
        if (distanceKm <= 12.0) return 0.7;
        return 0.35;
      case TravelMode.microMobility:
        if (distanceKm <= 0.8) return 0.45;
        if (distanceKm <= 4.0) return 0.92;
        if (distanceKm <= 8.0) return 0.68;
        return 0.3;
      case TravelMode.transit:
        if (distanceKm <= 1.0) return 0.3;
        if (distanceKm <= 5.0) return 0.72;
        if (distanceKm <= 30.0) return 0.94;
        return 0.82;
      case TravelMode.ferry:
        if (distanceKm <= 1.0) return 0.15;
        if (distanceKm <= 8.0) return 0.65;
        return 0.9;
      case TravelMode.indoor:
        if (distanceKm <= 0.2) return 0.95;
        if (distanceKm <= 0.8) return 0.55;
        return 0.1;
      case TravelMode.drive:
        if (distanceKm <= 1.0) return 0.2;
        if (distanceKm <= 4.0) return 0.52;
        if (distanceKm <= 35.0) return 0.88;
        return 0.78;
    }
  }

  static Map<String, List<double>> _defaultHistoricalPatterns() {
    return {
      TravelMode.walk.name: List<double>.filled(24, 0.85),
      TravelMode.cycle.name: List<double>.filled(24, 0.82),
      TravelMode.microMobility.name: List<double>.filled(24, 0.8),
      TravelMode.ferry.name: List<double>.filled(24, 0.63),
      TravelMode.indoor.name: List<double>.filled(24, 0.7),
      TravelMode.drive.name: <double>[
        0.68,
        0.7,
        0.72,
        0.74,
        0.76,
        0.72,
        0.42,
        0.35,
        0.38,
        0.55,
        0.66,
        0.72,
        0.73,
        0.71,
        0.68,
        0.62,
        0.48,
        0.32,
        0.28,
        0.45,
        0.56,
        0.62,
        0.66,
        0.69,
      ],
      TravelMode.transit.name: <double>[
        0.58,
        0.58,
        0.58,
        0.58,
        0.6,
        0.65,
        0.72,
        0.76,
        0.74,
        0.69,
        0.67,
        0.66,
        0.68,
        0.7,
        0.72,
        0.74,
        0.77,
        0.73,
        0.69,
        0.66,
        0.64,
        0.62,
        0.6,
        0.58,
      ],
    };
  }

  double _baseSpeedMps(TravelMode mode) {
    switch (mode) {
      case TravelMode.walk:
        return 1.45;
      case TravelMode.cycle:
        return 5.2;
      case TravelMode.microMobility:
        return 4.6;
      case TravelMode.transit:
        return 8.8;
      case TravelMode.ferry:
        return 7.5;
      case TravelMode.indoor:
        return 1.1;
      case TravelMode.drive:
        return 11.5;
    }
  }

  CrowdingLevel _estimateTransitCrowding(DateTime time) {
    if ((time.hour >= 7 && time.hour <= 9) ||
        (time.hour >= 16 && time.hour <= 18)) {
      return CrowdingLevel.high;
    }
    if (time.hour >= 11 && time.hour <= 14) {
      return CrowdingLevel.moderate;
    }
    return CrowdingLevel.low;
  }

  double? _estimateCost(
    TravelMode mode,
    double distanceMeters,
    double durationSec,
  ) {
    final distanceKm = distanceMeters / 1000.0;
    switch (mode) {
      case TravelMode.walk:
        return 0;
      case TravelMode.cycle:
        return distanceKm * 0.08;
      case TravelMode.microMobility:
        return 1.2 + (durationSec / 60.0 * 0.22);
      case TravelMode.transit:
        return 2.0 + min(3.5, distanceKm * 0.18);
      case TravelMode.ferry:
        return 3.5 + min(6.0, distanceKm * 0.12);
      case TravelMode.indoor:
        return 0;
      case TravelMode.drive:
        return 2.5 + (distanceKm * 0.35);
    }
  }

  String _buildModeReason(
    TravelMode mode,
    double speedFactor,
    double complianceFactor,
    double convenienceFactor,
    DateTime time,
  ) {
    if (complianceFactor < 0.5) {
      return 'Compliance restrictions reduce ${mode.name} viability.';
    }
    if (speedFactor > 0.78) {
      return mode == TravelMode.transit
          ? 'Pre-peak transit headways are favorable.'
          : 'Light traffic window favors ${mode.name}.';
    }
    if (convenienceFactor > 0.85) {
      return '${mode.name} matches this trip distance well.';
    }
    if (time.hour >= 7 && time.hour <= 9 && mode == TravelMode.transit) {
      return 'Transit remains competitive through the morning peak.';
    }
    return 'Balanced travel time and convenience for ${mode.name}.';
  }

  String _buildWindowReason(
    TravelMode mode,
    DateTime windowStart,
    String modeReason,
  ) {
    if (mode == TravelMode.transit && windowStart.hour < 7) {
      return 'Pre-peak transit with lower crowding. $modeReason';
    }
    if (mode == TravelMode.drive && (windowStart.hour < 6 || windowStart.hour > 20)) {
      return 'Light traffic window. $modeReason';
    }
    return modeReason;
  }

  bool _contains(List<LatLng> polygon, LatLng point) {
    if (polygon.length < 3) {
      return false;
    }
    var inside = false;
    for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      final xi = polygon[i].longitude;
      final yi = polygon[i].latitude;
      final xj = polygon[j].longitude;
      final yj = polygon[j].latitude;
      final denom = (yj - yi) == 0 ? 1e-12 : (yj - yi);
      final intersect = ((yi > point.latitude) != (yj > point.latitude)) &&
          (point.longitude <
              ((xj - xi) * (point.latitude - yi) / denom) + xi);
      if (intersect) {
        inside = !inside;
      }
    }
    return inside;
  }

  double _clamp01(double value) => value.clamp(0.0, 1.0).toDouble();
}
