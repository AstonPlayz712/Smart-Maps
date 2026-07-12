import 'dart:async';
import 'dart:math' as math;
import '../models/latlng.dart';
import '../models/weather_overlay.dart';

// ─── WeatherCondition ─────────────────────────────────────────────────────────

class WeatherCondition {
  final LatLng location;
  final WeatherType type;
  final double temperature;
  final double feelsLike;
  final double humidity;
  final double windSpeedMps;
  final double windBearing;
  final double precipMmPerHour;
  final double visibilityMeters;
  final DateTime updatedAt;

  const WeatherCondition({
    required this.location,
    required this.type,
    required this.temperature,
    required this.feelsLike,
    required this.humidity,
    required this.windSpeedMps,
    required this.windBearing,
    required this.precipMmPerHour,
    required this.visibilityMeters,
    required this.updatedAt,
  });
}

// ─── WeatherService ───────────────────────────────────────────────────────────

/// Provides weather conditions and overlays.
///
/// Actual weather data is fetched via a third-party API (e.g. OpenWeatherMap).
/// This implementation stubs the HTTP layer while exposing the full service
/// contract.
class WeatherService {
  final Map<String, WeatherCondition> _cache = {};
  final Map<String, WeatherOverlay> _overlays = {};
  static const _cacheDuration = Duration(minutes: 10);
  final Map<String, DateTime> _cacheTimestamps = {};

  final _rng = math.Random();

  // ─── Public API ─────────────────────────────────────────────────────────────

  /// Returns current weather at [position].
  ///
  /// Uses a local cache valid for [_cacheDuration]; generates simulated data
  /// when the cache misses (replace with real HTTP call in production).
  Future<WeatherCondition> getConditions(LatLng position) async {
    final key = _cacheKey(position);
    if (_isCacheValid(key)) return _cache[key]!;

    // Simulate a network fetch with 50-200 ms latency.
    await Future<void>.delayed(
      Duration(milliseconds: 50 + _rng.nextInt(150)),
    );
    final cond = _generateSimulated(position);
    _cacheCondition(position, cond);
    return cond;
  }

  /// Returns a [WeatherOverlay] grid for the area around [center].
  Future<WeatherOverlay?> getOverlay(
    LatLng center,
    double radiusMeters,
  ) async {
    final key = _cacheKey(center);
    if (_overlays.containsKey(key)) return _overlays[key];

    await Future<void>.delayed(const Duration(milliseconds: 80));
    final cond = await getConditions(center);

    // Build a simple 4×4 intensity grid.
    const gridSize = 4;
    final intensity = List.generate(
      gridSize,
      (_) => List.generate(
        gridSize,
        (_) => cond.precipMmPerHour > 0
            ? math.min(1.0, cond.precipMmPerHour / 10.0) *
                (0.6 + _rng.nextDouble() * 0.4)
            : 0.0,
      ),
    );

    final degOffset = radiusMeters / 111320.0; // rough lat/lng degrees
    final overlay = WeatherOverlay(
      id: 'overlay_$key',
      type: cond.type,
      bounds: LatLngBounds(
        sw: LatLng(center.lat - degOffset, center.lng - degOffset),
        ne: LatLng(center.lat + degOffset, center.lng + degOffset),
      ),
      intensityGrid: intensity,
      windSpeedMps: cond.windSpeedMps,
      windBearingDeg: cond.windBearing,
      precipMmPerHour: cond.precipMmPerHour,
      visibilityMeters: cond.visibilityMeters,
      temperatureCelsius: cond.temperature,
      updatedAt: DateTime.now(),
    );

    _overlays[key] = overlay;
    return overlay;
  }

  /// Returns the next rain window near [position] as a (start, end) pair,
  /// or null if no rain is expected.
  (DateTime, DateTime)? getRainWindow(LatLng position) {
    // Stub: return a 1-hour window 2 hours from now 30% of the time.
    if (_rng.nextDouble() < 0.3) {
      final start = DateTime.now().add(const Duration(hours: 2));
      final end = start.add(const Duration(hours: 1));
      return (start, end);
    }
    return null;
  }

  bool isGoodWeatherForCycling(WeatherCondition cond) {
    return cond.windSpeedMps < 10.0 &&
        cond.precipMmPerHour == 0 &&
        cond.visibilityMeters >= 500;
  }

  bool isGoodWeatherForMicro(WeatherCondition cond) {
    return cond.windSpeedMps < 7.0 &&
        cond.precipMmPerHour == 0 &&
        cond.visibilityMeters >= 500;
  }

  void clearCache() {
    _cache.clear();
    _cacheTimestamps.clear();
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  String _cacheKey(LatLng pos) {
    return '${pos.lat.toStringAsFixed(2)}_${pos.lng.toStringAsFixed(2)}';
  }

  bool _isCacheValid(String key) {
    final ts = _cacheTimestamps[key];
    if (ts == null) return false;
    return DateTime.now().difference(ts) < _cacheDuration;
  }

  void _cacheCondition(LatLng position, WeatherCondition cond) {
    final key = _cacheKey(position);
    _cache[key] = cond;
    _cacheTimestamps[key] = DateTime.now();
  }

  WeatherCondition _generateSimulated(LatLng position) {
    // Use position hash to create deterministic but varied conditions.
    final seed = (position.lat * 1000 + position.lng * 1000).abs().toInt();
    final r = math.Random(seed);

    final types = WeatherType.values;
    final type = types[r.nextInt(types.length)];

    double precip = 0;
    double vis = 10000;
    if (type == WeatherType.rain || type == WeatherType.heavyRain) {
      precip = type == WeatherType.heavyRain ? 10 + r.nextDouble() * 15 : 1 + r.nextDouble() * 5;
      vis = 500 + r.nextDouble() * 2000;
    } else if (type == WeatherType.fog) {
      vis = 50 + r.nextDouble() * 300;
    }

    return WeatherCondition(
      location: position,
      type: type,
      temperature: 8 + r.nextDouble() * 22,
      feelsLike: 5 + r.nextDouble() * 20,
      humidity: 40 + r.nextDouble() * 50,
      windSpeedMps: r.nextDouble() * 15,
      windBearing: r.nextDouble() * 360,
      precipMmPerHour: precip,
      visibilityMeters: vis,
      updatedAt: DateTime.now(),
    );
  }
}
