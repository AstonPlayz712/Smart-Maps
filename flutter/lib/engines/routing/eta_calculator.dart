import '../../models/latlng.dart';
import '../../models/route_filament.dart';
import '../geo_utils.dart';

class EtaCalculator {
  double calculate(RouteFilament filament, double currentSpeedMps) {
    if (filament.distanceMeters <= 0) {
      return 0;
    }

    if (currentSpeedMps > 0) {
      return filament.distanceMeters / currentSpeedMps;
    }

    return filament.durationSec;
  }

  double withFriction(RouteFilament filament, double currentSpeedMps) {
    return calculate(filament, currentSpeedMps) +
        filament.frictionAbsorptionSec +
        _frictionSec(filament);
  }

  double remainingEta(
    RouteFilament filament,
    LatLng currentLocation,
    double currentSpeedMps,
  ) {
    if (filament.path.isEmpty) {
      return 0;
    }

    final snapped = GeoUtils.nearestPointOnPath(currentLocation, filament.path);
    final cumulative = GeoUtils.cumulativeDistances(filament.path);
    final total = cumulative.isEmpty ? 0.0 : cumulative.last;
    final remaining = (total - snapped.progressMeters).clamp(0.0, double.infinity).toDouble();
    if (remaining == 0) {
      return 0;
    }

    if (currentSpeedMps > 0) {
      return remaining / currentSpeedMps;
    }

    final averageSpeed = filament.durationSec <= 0
        ? 0.0
        : filament.distanceMeters / filament.durationSec;
    return averageSpeed <= 0 ? filament.durationSec : remaining / averageSpeed;
  }

  DateTime absoluteEta(RouteFilament filament, double currentSpeedMps) {
    final seconds = withFriction(filament, currentSpeedMps).round();
    return DateTime.now().add(Duration(seconds: seconds));
  }

  double _frictionSec(RouteFilament filament) {
    return filament.disruptionNodes.fold<double>(
      0,
      (sum, disruption) => sum + disruption.frictionAddedSec,
    );
  }
}
