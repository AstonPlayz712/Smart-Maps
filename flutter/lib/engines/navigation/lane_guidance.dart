import '../../models/mode_strand.dart';

class LaneGuidanceEngine {
  LaneGuidance? getGuidance(ManeuverInstruction maneuver, int laneCount) {
    if (laneCount <= 0) {
      return null;
    }
    final lanes = _buildLanes(maneuver.type, laneCount);
    final activeIndex = _activeLaneIndex(maneuver.type, laneCount);
    return LaneGuidance(
      maneuverType: maneuver.type,
      lanes: lanes,
      recommendedLaneIndex: activeIndex,
      instruction:
          'Use lane ${activeIndex + 1} for ${maneuver.description.toLowerCase()}',
    );
  }

  List<Lane> _buildLanes(ManeuverType maneuver, int laneCount) {
    final activeIndex = _activeLaneIndex(maneuver, laneCount);
    return List<Lane>.generate(laneCount, (index) {
      final directions = _directionsForLane(maneuver, index, activeIndex);
      return Lane(directions: directions, isActive: index == activeIndex);
    });
  }

  List<LaneDirection> _directionsForLane(
    ManeuverType maneuver,
    int index,
    int activeIndex,
  ) {
    if (_isLeftManeuver(maneuver)) {
      return index <= activeIndex
          ? [LaneDirection.left, LaneDirection.straight]
          : [LaneDirection.straight];
    }
    if (_isRightManeuver(maneuver)) {
      return index >= activeIndex
          ? [LaneDirection.right, LaneDirection.straight]
          : [LaneDirection.straight];
    }
    if (maneuver == ManeuverType.uTurn) {
      return index == activeIndex
          ? [LaneDirection.uTurn, LaneDirection.left]
          : [LaneDirection.straight];
    }
    return [LaneDirection.straight];
  }

  int _activeLaneIndex(ManeuverType maneuver, int laneCount) {
    if (_isLeftManeuver(maneuver) || maneuver == ManeuverType.uTurn) {
      return 0;
    }
    if (_isRightManeuver(maneuver)) {
      return laneCount - 1;
    }
    return laneCount ~/ 2;
  }

  bool _isLeftManeuver(ManeuverType maneuver) {
    return maneuver == ManeuverType.left ||
        maneuver == ManeuverType.turnLeft ||
        maneuver == ManeuverType.slightLeft ||
        maneuver == ManeuverType.sharpLeft ||
        maneuver == ManeuverType.keepLeft;
  }

  bool _isRightManeuver(ManeuverType maneuver) {
    return maneuver == ManeuverType.right ||
        maneuver == ManeuverType.turnRight ||
        maneuver == ManeuverType.slightRight ||
        maneuver == ManeuverType.sharpRight ||
        maneuver == ManeuverType.keepRight;
  }
}
