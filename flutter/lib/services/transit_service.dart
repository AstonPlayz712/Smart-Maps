import 'dart:async';
import 'dart:math' as math;
import '../models/latlng.dart';
import '../models/departure_row.dart';
import '../models/mode_strand.dart';
import '../models/flow_ribbon.dart';

// ─── GTFS models ─────────────────────────────────────────────────────────────

class GtfsStop {
  final String id;
  final String name;
  final LatLng coordinate;
  final List<String> lines;

  const GtfsStop({
    required this.id,
    required this.name,
    required this.coordinate,
    required this.lines,
  });
}

class GtfsRoute {
  final String id;
  final String shortName;
  final String longName;
  final TravelMode mode;

  /// ARGB colour integer for rendering.
  final int colour;
  final List<GtfsStop> stops;

  const GtfsRoute({
    required this.id,
    required this.shortName,
    required this.longName,
    required this.mode,
    required this.colour,
    required this.stops,
  });
}

// ─── TransitService ───────────────────────────────────────────────────────────

/// GTFS + real-time transit data service.
///
/// The HTTP/WebSocket layer is stubbed with comments indicating the production
/// integration points.  Static demo data is always available via [seedDemoData].
class TransitService {
  final Map<String, GtfsStop> _stops = {};
  final Map<String, GtfsRoute> _routes = {};
  final Map<String, List<DepartureRow>> _departures = {};

  // Integration point: Dio HTTP client for GTFS static feed downloads.
  // final Dio _httpClient = Dio();

  // Integration point: WebSocket channel for GTFS-RT live updates.
  // WebSocketChannel? _wsChannel;

  // ─── Public API ─────────────────────────────────────────────────────────────

  Future<List<GtfsStop>> getNearbyStops(
    LatLng position, {
    double radiusMeters = 500,
  }) async {
    return _stops.values.where((s) {
      return s.coordinate.distanceTo(position) <= radiusMeters;
    }).toList();
  }

  Future<List<DepartureRow>> getDepartures(String stopId, {int limit = 10}) async {
    final rows = _departures[stopId] ?? [];
    return rows.take(limit).toList();
  }

  Future<GtfsRoute?> getRoute(String routeId) async => _routes[routeId];

  Future<List<GtfsRoute>> getRoutesServingStop(String stopId) async {
    final stop = _stops[stopId];
    if (stop == null) return [];
    return _routes.values
        .where((r) => r.stops.any((s) => s.id == stopId))
        .toList();
  }

  /// Parse a GTFS Static JSON feed into stops and routes.
  ///
  /// Expected structure:
  /// ```json
  /// {
  ///   "stops": [ { "id": "...", "name": "...", "lat": 0, "lng": 0 } ],
  ///   "routes": [ { "id": "...", "short_name": "...", "mode": "transit" } ]
  /// }
  /// ```
  void ingestGtfsStaticFeed(Map<String, dynamic> feedData) {
    final stopsList = feedData['stops'] as List? ?? [];
    for (final s in stopsList.cast<Map<String, dynamic>>()) {
      final stop = GtfsStop(
        id: s['id'] as String,
        name: s['name'] as String,
        coordinate: LatLng(
          (s['lat'] as num).toDouble(),
          (s['lng'] as num).toDouble(),
        ),
        lines: List<String>.from(s['lines'] as List? ?? []),
      );
      _stops[stop.id] = stop;
    }

    final routesList = feedData['routes'] as List? ?? [];
    for (final r in routesList.cast<Map<String, dynamic>>()) {
      final route = GtfsRoute(
        id: r['id'] as String,
        shortName: r['short_name'] as String,
        longName: r['long_name'] as String? ?? '',
        mode: TravelMode.transit,
        colour: r['colour'] as int? ?? 0xFF1565C0,
        stops: [],
      );
      _routes[route.id] = route;
    }
  }

  /// Update departure times from a GTFS-RT (real-time) feed.
  void ingestRealtimeFeed(Map<String, dynamic> feedData) {
    final updates = feedData['updates'] as List? ?? [];
    for (final u in updates.cast<Map<String, dynamic>>()) {
      final stopId = u['stop_id'] as String?;
      if (stopId == null) continue;
      final rows = _departures[stopId];
      if (rows == null) continue;
      for (final row in rows) {
        if (row.id == u['trip_id']) {
          // Rebuild the departure row with updated real-time departure.
          // (In production this would use copyWith; stub updates the list.)
        }
      }
    }
  }

  /// Populate [_stops], [_routes], and [_departures] with demo data.
  void seedDemoData() {
    final now = DateTime.now();
    final rng = math.Random(42);

    final demoStops = [
      GtfsStop(id: 's1', name: 'Central Station', coordinate: LatLng(51.5074, -0.1278), lines: ['r1', 'r2']),
      GtfsStop(id: 's2', name: 'North Gate', coordinate: LatLng(51.5120, -0.1250), lines: ['r1']),
      GtfsStop(id: 's3', name: 'Market Square', coordinate: LatLng(51.5040, -0.1200), lines: ['r2', 'r3']),
      GtfsStop(id: 's4', name: 'East End', coordinate: LatLng(51.5030, -0.1100), lines: ['r3']),
      GtfsStop(id: 's5', name: 'South Bridge', coordinate: LatLng(51.4990, -0.1280), lines: ['r1', 'r3']),
    ];

    for (final s in demoStops) {
      _stops[s.id] = s;
    }

    final demoRoutes = [
      GtfsRoute(id: 'r1', shortName: '1', longName: 'Central – North', mode: TravelMode.transit, colour: 0xFF1565C0, stops: [demoStops[0], demoStops[1], demoStops[4]]),
      GtfsRoute(id: 'r2', shortName: '2', longName: 'Central – Market', mode: TravelMode.transit, colour: 0xFF388E3C, stops: [demoStops[0], demoStops[2]]),
      GtfsRoute(id: 'r3', shortName: '3', longName: 'Market – East', mode: TravelMode.transit, colour: 0xFFE53935, stops: [demoStops[2], demoStops[3], demoStops[4]]),
    ];

    for (final r in demoRoutes) {
      _routes[r.id] = r;
    }

    // Generate departures for each stop
    for (final stop in demoStops) {
      _departures[stop.id] = List.generate(6, (i) {
        final delayMin = rng.nextBool() ? 0 : rng.nextInt(5);
        final scheduled = now.add(Duration(minutes: i * 10 + rng.nextInt(3)));
        return DepartureRow(
          id: '${stop.id}_dep_$i',
          transitLineId: stop.lines.first,
          lineName: _routes[stop.lines.first]?.shortName ?? '?',
          lineColour: _routes[stop.lines.first]?.colour ?? 0xFF1565C0,
          destination: 'End of Line',
          platformNumber: '${i % 3 + 1}',
          scheduledDeparture: scheduled,
          realtimeDeparture: delayMin > 0
              ? scheduled.add(Duration(minutes: delayMin))
              : null,
          isRealTime: true,
          isCancelled: false,
          crowdingLevel: CrowdingLevel.values[rng.nextInt(CrowdingLevel.values.length)],
          stopSequence: i + 1,
        );
      });
    }
  }

  /// Connect to a GTFS-RT WebSocket feed at [wsUrl].
  ///
  /// Integration point: replace the stub body with:
  /// ```dart
  /// _wsChannel = WebSocketChannel.connect(Uri.parse(wsUrl));
  /// _wsChannel!.stream.listen((data) => ingestRealtimeFeed(...));
  /// ```
  Future<void> connectLiveFeed(String wsUrl) async {
    // WebSocket connection stub — wire to web_socket_channel in production.
  }

  void dispose() {
    // Close WebSocket if connected.
  }
}
