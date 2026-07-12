import '../../models/gate.dart';
import '../../models/latlng.dart';

enum CalloutType { junction, poi, transit, destination, speedLimit }

class INCallout {
  final String id;
  final String text;
  final LatLng coordinate;
  final double bearing;
  double distanceMeters;
  final CalloutType type;
  double opacity;
  bool isVisible;

  INCallout({
    required this.id,
    required this.text,
    required this.coordinate,
    required this.bearing,
    required this.distanceMeters,
    required this.type,
    this.opacity = 1.0,
    this.isVisible = true,
  });
}

class INCallouts {
  final List<INCallout> _callouts = [];
  final int _maxVisible = 5;

  void addGateCallout(Gate gate) {
    removeCallout(gate.id);
    _callouts.add(
      INCallout(
        id: gate.id,
        text: gate.calloutText ?? 'Junction ahead',
        coordinate: gate.coordinate,
        bearing: gate.approachBearing,
        distanceMeters: double.infinity,
        type: CalloutType.junction,
      ),
    );
  }

  void addDestinationCallout(LatLng destination, String label) {
    removeCallout('destination');
    _callouts.add(
      INCallout(
        id: 'destination',
        text: label,
        coordinate: destination,
        bearing: 0.0,
        distanceMeters: double.infinity,
        type: CalloutType.destination,
      ),
    );
  }

  void addSpeedLimitCallout(LatLng position, double limitMps) {
    removeCallout('speed-limit');
    final kph = (limitMps * 3.6).round();
    _callouts.add(
      INCallout(
        id: 'speed-limit',
        text: '$kph km/h',
        coordinate: position,
        bearing: 0.0,
        distanceMeters: double.infinity,
        type: CalloutType.speedLimit,
      ),
    );
  }

  void updateVisibility(LatLng cameraPosition, double bearing, double fovDeg) {
    final inView = <INCallout>[];
    for (final callout in _callouts) {
      callout.distanceMeters = cameraPosition.distanceTo(callout.coordinate);
      final visible = _isInFOV(callout, cameraPosition, bearing, fovDeg);
      callout.isVisible = visible;
      callout.opacity = visible
          ? (1.0 - (callout.distanceMeters / 1200.0)).clamp(0.25, 1.0).toDouble()
          : 0.0;
      if (visible) {
        inView.add(callout);
      }
    }

    inView.sort((a, b) => a.distanceMeters.compareTo(b.distanceMeters));
    final visibleIds = inView.take(_maxVisible).map((callout) => callout.id).toSet();
    for (final callout in _callouts) {
      if (!visibleIds.contains(callout.id)) {
        callout.isVisible = false;
        callout.opacity = 0.0;
      }
    }
  }

  void removeCallout(String id) {
    _callouts.removeWhere((callout) => callout.id == id);
  }

  void clear() {
    _callouts.clear();
  }

  List<INCallout> get visible {
    final visibleCallouts = _callouts.where((callout) => callout.isVisible).toList()
      ..sort((a, b) => a.distanceMeters.compareTo(b.distanceMeters));
    return List.unmodifiable(visibleCallouts.take(_maxVisible));
  }

  bool _isInFOV(
    INCallout callout,
    LatLng camera,
    double bearing,
    double fovDeg,
  ) {
    final calloutBearing = camera.bearingTo(callout.coordinate);
    final delta = _bearingDelta(calloutBearing, bearing);
    return delta.abs() <= fovDeg / 2.0;
  }

  double _bearingDelta(double a, double b) {
    final delta = ((a - b + 540.0) % 360.0) - 180.0;
    return delta;
  }
}
