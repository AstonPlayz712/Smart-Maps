import 'dart:async';
import 'dart:math';

import 'package:uuid/uuid.dart';

import '../../models/flow_ribbon.dart';
import '../../models/latlng.dart';
import '../../models/mode_strand.dart';

final Uuid _uuid = Uuid();

enum PlatformEnd { front, middle, rear }

class PlatformGuidance {
  const PlatformGuidance({
    required this.platformId,
    required this.bestCarriageIndex,
    required this.platformEnd,
    required this.reason,
  });

  final String platformId;
  final int bestCarriageIndex;
  final PlatformEnd platformEnd;
  final String reason;
}

class PassengerFlowEngine {
  final Map<String, List<FlowCell>> _carriageCrowding =
      <String, List<FlowCell>>{};
  final Map<String, CrowdingLevel> _platformCrowding =
      <String, CrowdingLevel>{};
  final Map<String, CrowdingLevel> _venueCrowding = <String, CrowdingLevel>{};
  final List<FlowRibbon> _activeRibbons = <FlowRibbon>[];
  final StreamController<FlowRibbon> _ribbonUpdates =
      StreamController<FlowRibbon>.broadcast();

  void updateCarriageCrowding(String vehicleId, List<FlowCell> cells) {
    _carriageCrowding[vehicleId] = List<FlowCell>.from(cells);
  }

  void updatePlatformCrowding(String platformId, CrowdingLevel level) {
    _platformCrowding[platformId] = level;
  }

  void updateVenueCrowding(String venueId, CrowdingLevel level) {
    _venueCrowding[venueId] = level;
  }

  CrowdingLevel getCarriageCrowding(String vehicleId, int carriageIndex) {
    final cells = _carriageCrowding[vehicleId];
    if (cells == null || carriageIndex < 0 || carriageIndex >= cells.length) {
      return CrowdingLevel.unknown;
    }
    return cells[carriageIndex].crowdingLevel;
  }

  int getBestCarriage(String vehicleId) {
    final cells = _carriageCrowding[vehicleId];
    if (cells == null || cells.isEmpty) {
      return 0;
    }
    var bestIndex = 0;
    var bestScore = _crowdingScore(cells.first.crowdingLevel);
    for (var i = 1; i < cells.length; i++) {
      final score = _crowdingScore(cells[i].crowdingLevel);
      if (score < bestScore || (score == bestScore && i < bestIndex)) {
        bestIndex = i;
        bestScore = score;
      }
    }
    return bestIndex;
  }

  CrowdingLevel getPlatformCrowding(String platformId) {
    return _platformCrowding[platformId] ?? CrowdingLevel.unknown;
  }

  CrowdingLevel getVenueCrowding(String venueId) {
    return _venueCrowding[venueId] ?? CrowdingLevel.unknown;
  }

  FlowRibbon generateRibbon(TravelMode mode, List<LatLng> path, String entityId) {
    final existingIndex = _activeRibbons.indexWhere(
      (ribbon) => ribbon.entityId == entityId && ribbon.mode == mode,
    );
    final overallCrowding = _estimateRibbonCrowding(mode);
    final cells = List<FlowCell>.generate(
      max(1, path.isEmpty ? 1 : path.length),
      (index) => FlowCell(
        id: _uuid.v4(),
        index: index,
        crowdingLevel: overallCrowding,
        intensity: (index + 1) / max(1, path.length),
      ),
    );

    final ribbon = FlowRibbon(
      id: existingIndex >= 0 ? _activeRibbons[existingIndex].id : _uuid.v4(),
      type: _flowTypeForMode(mode),
      mode: mode,
      entityId: entityId,
      path: List<LatLng>.from(path),
      cells: cells,
      crowdingLevel: overallCrowding,
      updatedAt: DateTime.now(),
    );

    updateRibbon(ribbon);
    return ribbon;
  }

  void updateRibbon(FlowRibbon ribbon) {
    final index = _activeRibbons.indexWhere((existing) => existing.id == ribbon.id);
    if (index >= 0) {
      _activeRibbons[index] = ribbon;
    } else {
      _activeRibbons.add(ribbon);
    }
    _ribbonUpdates.add(ribbon);
  }

  List<FlowRibbon> getRibbonsNear(LatLng position, double radiusMeters) {
    return _activeRibbons.where((ribbon) {
      return ribbon.path.any((point) => point.distanceTo(position) <= radiusMeters);
    }).toList(growable: false);
  }

  PlatformGuidance getPlatformGuidance(String vehicleId, String platformId) {
    final bestCarriageIndex = getBestCarriage(vehicleId);
    final carriageCount = _carriageCrowding[vehicleId]?.length ?? 1;
    final ratio = carriageCount <= 1 ? 0.5 : bestCarriageIndex / (carriageCount - 1);
    final platformEnd = ratio < 0.34
        ? PlatformEnd.front
        : ratio > 0.66
            ? PlatformEnd.rear
            : PlatformEnd.middle;
    final platformCrowding = getPlatformCrowding(platformId);
    final carriageCrowding = getCarriageCrowding(vehicleId, bestCarriageIndex);

    return PlatformGuidance(
      platformId: platformId,
      bestCarriageIndex: bestCarriageIndex,
      platformEnd: platformEnd,
      reason:
          'Best boarding choice is carriage ${bestCarriageIndex + 1} at the ${platformEnd.name} where carriage crowding is ${carriageCrowding.name} and platform crowding is ${platformCrowding.name}.',
    );
  }

  Stream<FlowRibbon> get ribbonUpdates => _ribbonUpdates.stream;

  void dispose() {
    _ribbonUpdates.close();
  }

  FlowType _flowTypeForMode(TravelMode mode) {
    switch (mode) {
      case TravelMode.walk:
        return FlowType.pedestrian;
      case TravelMode.cycle:
        return FlowType.cycling;
      case TravelMode.microMobility:
        return FlowType.microMobility;
      case TravelMode.transit:
        return FlowType.transit;
      case TravelMode.ferry:
        return FlowType.transit;
      case TravelMode.indoor:
        return FlowType.pedestrian;
      case TravelMode.drive:
        return FlowType.vehicular;
    }
  }

  CrowdingLevel _estimateRibbonCrowding(TravelMode mode) {
    final platformLevels = _platformCrowding.values.toList(growable: false);
    final venueLevels = _venueCrowding.values.toList(growable: false);
    if ((mode == TravelMode.transit || mode == TravelMode.ferry) &&
        platformLevels.isNotEmpty) {
      return _averageCrowding(platformLevels);
    }
    if ((mode == TravelMode.walk || mode == TravelMode.indoor) &&
        venueLevels.isNotEmpty) {
      return _averageCrowding(venueLevels);
    }
    if (mode == TravelMode.drive) {
      return CrowdingLevel.low;
    }
    if (mode == TravelMode.cycle || mode == TravelMode.microMobility) {
      return venueLevels.isEmpty ? CrowdingLevel.moderate : _averageCrowding(venueLevels);
    }
    return CrowdingLevel.unknown;
  }

  CrowdingLevel _averageCrowding(List<CrowdingLevel> levels) {
    final average =
        levels.map(_crowdingScore).reduce((a, b) => a + b) / levels.length;
    if (average < 0.75) return CrowdingLevel.low;
    if (average < 1.75) return CrowdingLevel.moderate;
    if (average < 2.75) return CrowdingLevel.high;
    return CrowdingLevel.severe;
  }

  int _crowdingScore(CrowdingLevel level) {
    switch (level) {
      case CrowdingLevel.unknown:
        return 2;
      case CrowdingLevel.low:
        return 0;
      case CrowdingLevel.moderate:
        return 1;
      case CrowdingLevel.high:
        return 2;
      case CrowdingLevel.severe:
        return 3;
    }
  }
}
