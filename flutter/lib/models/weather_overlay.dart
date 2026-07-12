import 'latlng.dart';

enum WeatherType { clear, rain, heavyRain, snow, wind, heat, storm, fog, cloudy }

class LatLngBounds {
  const LatLngBounds({required this.sw, required this.ne});

  final LatLng sw;
  final LatLng ne;
}

class WeatherOverlay {
  const WeatherOverlay({
    required this.id,
    required this.type,
    this.bounds,
    this.intensityGrid = const <List<double>>[],
    this.windSpeedMps,
    this.windBearingDeg,
    this.precipMmPerHour,
    this.visibilityMeters,
    this.temperatureCelsius,
    this.polygon = const <LatLng>[],
    this.intensity,
    required this.updatedAt,
  });

  final String id;
  final WeatherType type;
  final LatLngBounds? bounds;
  final List<List<double>> intensityGrid;
  final double? windSpeedMps;
  final double? windBearingDeg;
  final double? precipMmPerHour;
  final double? visibilityMeters;
  final double? temperatureCelsius;
  final List<LatLng> polygon;
  final double? intensity;
  final DateTime updatedAt;
}
