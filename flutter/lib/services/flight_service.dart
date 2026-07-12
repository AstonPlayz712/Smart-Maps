import 'dart:math' as math;
import '../models/latlng.dart';

// ─── Flight models ────────────────────────────────────────────────────────────

enum FlightStatus {
  onTime,
  delayed,
  cancelled,
  boarding,
  departed,
  landed,
}

class Flight {
  final String id;
  final String flightNumber;
  final String airline;
  final String origin;
  final String destination;
  final DateTime scheduledDeparture;
  final DateTime scheduledArrival;
  final DateTime? estimatedDeparture;
  final DateTime? estimatedArrival;
  final String? terminal;
  final String? gate;
  final FlightStatus status;
  final int delayMinutes;
  final String? baggageClaim;

  const Flight({
    required this.id,
    required this.flightNumber,
    required this.airline,
    required this.origin,
    required this.destination,
    required this.scheduledDeparture,
    required this.scheduledArrival,
    this.estimatedDeparture,
    this.estimatedArrival,
    this.terminal,
    this.gate,
    this.status = FlightStatus.onTime,
    this.delayMinutes = 0,
    this.baggageClaim,
  });

  Flight copyWith({
    FlightStatus? status,
    int? delayMinutes,
    DateTime? estimatedDeparture,
    DateTime? estimatedArrival,
    String? gate,
  }) {
    return Flight(
      id: id,
      flightNumber: flightNumber,
      airline: airline,
      origin: origin,
      destination: destination,
      scheduledDeparture: scheduledDeparture,
      scheduledArrival: scheduledArrival,
      estimatedDeparture: estimatedDeparture ?? this.estimatedDeparture,
      estimatedArrival: estimatedArrival ?? this.estimatedArrival,
      terminal: terminal,
      gate: gate ?? this.gate,
      status: status ?? this.status,
      delayMinutes: delayMinutes ?? this.delayMinutes,
      baggageClaim: baggageClaim,
    );
  }
}

class AirportTerminal {
  final String id;
  final String name;
  final LatLng location;
  final List<String> gates;
  final List<String> lounges;

  const AirportTerminal({
    required this.id,
    required this.name,
    required this.location,
    required this.gates,
    required this.lounges,
  });
}

// ─── FlightService ────────────────────────────────────────────────────────────

/// Airport intelligence: flight status, gate info, terminal layout.
class FlightService {
  final Map<String, Flight> _flights = {};
  final Map<String, AirportTerminal> _terminals = {};

  // ─── Public API ─────────────────────────────────────────────────────────────

  Future<Flight?> getFlight(String flightNumber) async =>
      _flights[flightNumber.toUpperCase()];

  Future<List<Flight>> getDepartures(
    String airportCode, {
    DateTime? from,
  }) async {
    final now = from ?? DateTime.now();
    return _flights.values
        .where((f) =>
            f.origin == airportCode &&
            f.scheduledDeparture.isAfter(now) &&
            f.scheduledDeparture
                .isBefore(now.add(const Duration(hours: 6))))
        .toList()
      ..sort((a, b) =>
          a.scheduledDeparture.compareTo(b.scheduledDeparture));
  }

  Future<List<Flight>> getArrivals(
    String airportCode, {
    DateTime? from,
  }) async {
    final now = from ?? DateTime.now();
    return _flights.values
        .where((f) =>
            f.destination == airportCode &&
            f.scheduledArrival.isAfter(now) &&
            f.scheduledArrival
                .isBefore(now.add(const Duration(hours: 6))))
        .toList()
      ..sort((a, b) => a.scheduledArrival.compareTo(b.scheduledArrival));
  }

  Future<AirportTerminal?> getTerminal(String terminalId) async =>
      _terminals[terminalId];

  /// Returns a display string like "Terminal 2, Gate B14".
  Future<String?> getGateForFlight(String flightNumber) async {
    final flight = _flights[flightNumber.toUpperCase()];
    if (flight == null) return null;
    final parts = <String>[];
    if (flight.terminal != null) parts.add('Terminal ${flight.terminal}');
    if (flight.gate != null) parts.add('Gate ${flight.gate}');
    return parts.isEmpty ? null : parts.join(', ');
  }

  /// Returns the geographic location of a flight's departure gate, or null.
  Future<LatLng?> getGateLocation(String flightNumber) async {
    final flight = _flights[flightNumber.toUpperCase()];
    if (flight?.terminal == null) return null;
    return _terminals[flight!.terminal]?.location;
  }

  void updateFlightStatus(
    String flightNumber,
    FlightStatus status, {
    int delayMinutes = 0,
  }) {
    final key = flightNumber.toUpperCase();
    final f = _flights[key];
    if (f == null) return;
    _flights[key] = f.copyWith(
      status: status,
      delayMinutes: delayMinutes,
      estimatedDeparture: delayMinutes > 0
          ? f.scheduledDeparture.add(Duration(minutes: delayMinutes))
          : null,
    );
  }

  /// Populate with demo flights and terminals.
  void seedDemoData() {
    final now = DateTime.now();
    final rng = math.Random(7);

    _terminals['T1'] = const AirportTerminal(
      id: 'T1',
      name: 'Terminal 1',
      location: LatLng(51.4706, -0.4619),
      gates: ['A1', 'A2', 'A3', 'B1', 'B2'],
      lounges: ['Premier Lounge', 'Sky Lounge'],
    );
    _terminals['T2'] = const AirportTerminal(
      id: 'T2',
      name: 'Terminal 2',
      location: LatLng(51.4750, -0.4580),
      gates: ['C1', 'C2', 'D1', 'D2'],
      lounges: ['Business Lounge'],
    );

    final demoFlights = [
      Flight(
        id: 'f1',
        flightNumber: 'BA123',
        airline: 'British Airways',
        origin: 'LHR',
        destination: 'CDG',
        scheduledDeparture: now.add(Duration(hours: 1, minutes: rng.nextInt(30))),
        scheduledArrival: now.add(Duration(hours: 2, minutes: rng.nextInt(20))),
        terminal: 'T1',
        gate: 'A2',
        status: FlightStatus.onTime,
      ),
      Flight(
        id: 'f2',
        flightNumber: 'EK456',
        airline: 'Emirates',
        origin: 'LHR',
        destination: 'DXB',
        scheduledDeparture: now.add(Duration(hours: 2, minutes: rng.nextInt(30))),
        scheduledArrival: now.add(const Duration(hours: 8)),
        terminal: 'T2',
        gate: 'D1',
        status: FlightStatus.boarding,
        delayMinutes: 15,
      ),
      Flight(
        id: 'f3',
        flightNumber: 'VS789',
        airline: 'Virgin Atlantic',
        origin: 'JFK',
        destination: 'LHR',
        scheduledDeparture: now.subtract(const Duration(hours: 8)),
        scheduledArrival: now.add(Duration(minutes: 30 + rng.nextInt(20))),
        terminal: 'T1',
        gate: 'B1',
        status: FlightStatus.landed,
        baggageClaim: 'Belt 3',
      ),
    ];

    for (final f in demoFlights) {
      _flights[f.flightNumber] = f;
    }
  }
}
