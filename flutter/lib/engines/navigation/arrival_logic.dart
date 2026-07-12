import '../../models/latlng.dart';
import '../geo_utils.dart';

enum ArrivalApproach {
  left,
  right,
  straight,
}

class ArrivalLogic {
  bool isArrived(
    LatLng position,
    LatLng destination, {
    double thresholdMeters = 35.0,
  }) {
    return GeoUtils.haversineMeters(position, destination) <= thresholdMeters;
  }

  bool isApproachingDestination(
    LatLng position,
    LatLng destination, {
    double thresholdMeters = 200.0,
  }) {
    return GeoUtils.haversineMeters(position, destination) <= thresholdMeters;
  }

  ArrivalApproach classifyApproach(
    LatLng position,
    LatLng destination,
    double headingDeg,
  ) {
    final targetBearing = GeoUtils.bearingDegrees(position, destination);
    final delta = GeoUtils.signedTurnAngle(headingDeg, targetBearing);
    if (delta < -25) {
      return ArrivalApproach.left;
    }
    if (delta > 25) {
      return ArrivalApproach.right;
    }
    return ArrivalApproach.straight;
  }

  Duration estimateRemainingTime(
    LatLng position,
    LatLng destination,
    double speedMps,
  ) {
    final distance = GeoUtils.haversineMeters(position, destination);
    final speed = speedMps > 0 ? speedMps : 1.4;
    return Duration(seconds: (distance / speed).round());
  }
}
