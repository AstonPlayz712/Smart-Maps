import 'dart:async';

import '../engines/routing/routing_engine.dart';
import '../engines/navigation/navigation_engine.dart';
import '../engines/immersive/in_engine.dart';
import '../engines/sonic/sonic_engine.dart';
import '../engines/disruption/disruption_engine.dart';
import '../engines/predictive/predictive_routing_engine.dart';
import '../engines/compliance/compliance_engine.dart';
import '../engines/passenger_flow/passenger_flow_engine.dart';
import '../engines/pipelines/pipelines_engine.dart';
import '../engines/indoor/indoor_driving_engine.dart';
import '../engines/ae_fusion/ae_fusion_engine.dart';
import '../services/transit_service.dart';
import '../services/flight_service.dart';
import '../services/weather_service.dart';
import '../services/mapbox_service.dart';
import '../services/geometry_service.dart';
import '../services/sensor_service.dart';
import '../rendering/map_renderer.dart';
import '../rendering/filament_renderer.dart';
import '../rendering/in_renderer.dart';
import '../rendering/disruption_renderer.dart';
import '../rendering/flow_renderer.dart';
import '../rendering/micro_mobility_renderer.dart';
import '../state_machines/app_state_machine.dart';
import '../state_machines/navigation_state_machine.dart';
import '../state_machines/in_state_machine.dart';
import '../state_machines/disruption_state_machine.dart';
import '../state_machines/arrival_state_machine.dart';
import '../state_machines/sonic_state_machine.dart';
import '../state_machines/movement_state_machine.dart';
import '../state_machines/settings_depth_stack.dart';
import '../platform/sm_maps_platform.dart';
import '../platform/platform_config.dart';
import '../models/latlng.dart';
import '../models/mode_strand.dart';
import '../models/route_filament.dart';
import 'event_bus.dart';

// ─── SmartMapsEngine ──────────────────────────────────────────────────────────

/// The unified Smart Maps kernel.
///
/// Owns every engine, service, renderer, and state machine.  Cross-cutting
/// coordination (sensor → fusion → navigation, disruption → reroute, etc.)
/// is wired here through stream subscriptions so each subsystem remains
/// independently replaceable.
class SmartMapsEngine {
  // ─── Engines ─────────────────────────────────────────────────────────────────

  final RoutingEngine routingEngine;
  final NavigationEngine navigationEngine;
  final ImmersiveNavigationEngine inEngine;
  final SonicEngine sonicEngine;
  final DisruptionEngine disruptionEngine;
  final PredictiveRoutingEngine predictiveEngine;
  final ComplianceEngine complianceEngine;
  final PassengerFlowEngine flowEngine;
  final PipelinesEngine pipelinesEngine;
  final IndoorDrivingEngine indoorEngine;
  final AEFusionEngine fusionEngine;

  // ─── Services ─────────────────────────────────────────────────────────────────

  final TransitService transitService;
  final FlightService flightService;
  final WeatherService weatherService;
  final MapboxService mapboxService;
  final GeometryService geometryService;
  final SensorService sensorService;

  // ─── Renderers ───────────────────────────────────────────────────────────────

  final MapRenderer mapRenderer;
  final FilamentRenderer filamentRenderer;
  final INRenderer inRenderer;
  final DisruptionRenderer disruptionRenderer;
  final FlowRenderer flowRenderer;
  final MicroMobilityRenderer microMobilityRenderer;

  // ─── State machines ──────────────────────────────────────────────────────────

  final AppStateMachine appState;
  final NavigationStateMachine navigationState;
  final INStateMachine inState;
  final DisruptionStateMachine disruptionState;
  final ArrivalStateMachine arrivalState;
  final SonicStateMachine sonicState;
  final MovementStateMachine movementState;
  final SettingsDepthStack settingsStack;

  // ─── Core ────────────────────────────────────────────────────────────────────

  final EventBus<SmEvent> bus;
  final SmMapsPlatform platform;

  // ─── Internal subscriptions ───────────────────────────────────────────────────

  final List<StreamSubscription<dynamic>> _subscriptions = [];

  // ─── Factory constructor ──────────────────────────────────────────────────────

  SmartMapsEngine._({
    required this.routingEngine,
    required this.navigationEngine,
    required this.inEngine,
    required this.sonicEngine,
    required this.disruptionEngine,
    required this.predictiveEngine,
    required this.complianceEngine,
    required this.flowEngine,
    required this.pipelinesEngine,
    required this.indoorEngine,
    required this.fusionEngine,
    required this.transitService,
    required this.flightService,
    required this.weatherService,
    required this.mapboxService,
    required this.geometryService,
    required this.sensorService,
    required this.mapRenderer,
    required this.filamentRenderer,
    required this.inRenderer,
    required this.disruptionRenderer,
    required this.flowRenderer,
    required this.microMobilityRenderer,
    required this.appState,
    required this.navigationState,
    required this.inState,
    required this.disruptionState,
    required this.arrivalState,
    required this.sonicState,
    required this.movementState,
    required this.settingsStack,
    required this.bus,
    required this.platform,
  });

  /// Create and wire the full Smart Maps kernel.
  static SmartMapsEngine create({String mapboxToken = ''}) {
    // ── Instantiate all subsystems ─────────────────────────────────────────────

    final routingEngine = RoutingEngine();
    final navigationEngine = NavigationEngine();
    final inEngine = ImmersiveNavigationEngine();
    final sonicEngine = SonicEngine();
    final disruptionEngine = DisruptionEngine();
    final predictiveEngine = PredictiveRoutingEngine();
    final complianceEngine = ComplianceEngine();
    final flowEngine = PassengerFlowEngine();
    final pipelinesEngine = PipelinesEngine();
    final indoorEngine = IndoorDrivingEngine();
    final fusionEngine = AEFusionEngine();

    final transitService = TransitService();
    final flightService = FlightService();
    final weatherService = WeatherService();
    final mapboxService = MapboxService();
    final geometryService = GeometryService();
    final sensorService = SensorService();

    final mapRenderer = MapRenderer();
    final filamentRenderer = FilamentRenderer();
    final inRenderer = INRenderer();
    final disruptionRenderer = DisruptionRenderer();
    final flowRenderer = FlowRenderer();
    final microMobilityRenderer = MicroMobilityRenderer();

    final appState = AppStateMachine();
    final navigationState = NavigationStateMachine();
    final inState = INStateMachine();
    final disruptionState = DisruptionStateMachine();
    final arrivalState = ArrivalStateMachine();
    final sonicState = SonicStateMachine();
    final movementState = MovementStateMachine();
    final settingsStack = SettingsDepthStack();

    final bus = EventBus<SmEvent>();
    final platform = PlatformConfig.current;

    final engine = SmartMapsEngine._(
      routingEngine: routingEngine,
      navigationEngine: navigationEngine,
      inEngine: inEngine,
      sonicEngine: sonicEngine,
      disruptionEngine: disruptionEngine,
      predictiveEngine: predictiveEngine,
      complianceEngine: complianceEngine,
      flowEngine: flowEngine,
      pipelinesEngine: pipelinesEngine,
      indoorEngine: indoorEngine,
      fusionEngine: fusionEngine,
      transitService: transitService,
      flightService: flightService,
      weatherService: weatherService,
      mapboxService: mapboxService,
      geometryService: geometryService,
      sensorService: sensorService,
      mapRenderer: mapRenderer,
      filamentRenderer: filamentRenderer,
      inRenderer: inRenderer,
      disruptionRenderer: disruptionRenderer,
      flowRenderer: flowRenderer,
      microMobilityRenderer: microMobilityRenderer,
      appState: appState,
      navigationState: navigationState,
      inState: inState,
      disruptionState: disruptionState,
      arrivalState: arrivalState,
      sonicState: sonicState,
      movementState: movementState,
      settingsStack: settingsStack,
      bus: bus,
      platform: platform,
    );

    engine._wireSubscriptions(mapboxToken);
    return engine;
  }

  // ─── Initialisation ──────────────────────────────────────────────────────────

  Future<void> initialize() async {
    await platform.initialize();
    mapboxService.initialize(
      _mapboxToken.isNotEmpty ? _mapboxToken : 'pk.placeholder',
    );
    mapRenderer.initialize(mapboxService);
    mapRenderer.enable3DBuildings(true);

    transitService.seedDemoData();
    flightService.seedDemoData();

    if (platform.getCapabilities().contains(PlatformCapability.allSensors) ||
        platform.getCapabilities().contains(PlatformCapability.navigation)) {
      await sensorService.start();
    }

    bus.emit(const SmReadyEvent());
  }

  String _mapboxToken = '';

  // ─── Navigation API ──────────────────────────────────────────────────────────

  Future<void> startNavigation(LatLng destination, TravelMode mode) async {
    final origin = sensorService.currentData?.position ??
        const LatLng(51.5074, -0.1278); // London default

    final filament = await routingEngine.route(origin, destination, mode);

    navigationEngine.beginNavigation(filament);
    filamentRenderer.loadFilament(filament);
    mapRenderer.renderFilament(filament);

    sonicEngine.enqueueManeuver(
      filament.strands.isNotEmpty &&
              filament.strands.first.instructions.isNotEmpty
          ? filament.strands.first.instructions.first
          : filament.strands
              .expand((s) => s.instructions)
              .firstOrNull ??
              _departInstruction(origin),
    );

    appState.transition(AppState.navigation);
    bus.emit(NavigationStartedEvent(destination));
  }

  void stopNavigation() {
    navigationEngine.stopNavigation();
    filamentRenderer.clear();
    mapRenderer.clearFilament();
    inEngine.exit();
    inRenderer.deactivate();
    appState.transition(AppState.home);
    bus.emit(const NavigationStoppedEvent());
  }

  Future<void> reroute(LatLng destination, TravelMode mode) async {
    sonicEngine.enqueueReroute();
    final origin = sensorService.currentData?.position ??
        const LatLng(51.5074, -0.1278);
    final filament = await routingEngine.route(origin, destination, mode);
    navigationEngine.beginNavigation(filament);
    filamentRenderer.loadFilament(filament);
    mapRenderer.renderFilament(filament);
    bus.emit(RerouteEvent(filament));
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────────────

  void dispose() {
    for (final sub in _subscriptions) {
      sub.cancel();
    }
    _subscriptions.clear();

    sonicEngine.dispose();
    disruptionEngine.dispose();
    flowEngine.dispose();
    pipelinesEngine.dispose();
    fusionEngine.dispose();
    disruptionRenderer.dispose();
    sensorService.dispose();
    mapboxService.dispose();
    bus.dispose();
    platform.dispose();
  }

  // ─── Cross-engine wiring ──────────────────────────────────────────────────────

  void _wireSubscriptions(String mapboxToken) {
    _mapboxToken = mapboxToken;

    // 1. Sensor → A/E Fusion
    _subscriptions.add(
      sensorService.dataStream.listen((data) {
        fusionEngine.ingestReading(SensorReading(
          timestamp: data.timestamp,
          gnssPosition:
              data.position,
          gnssAccuracyMeters: data.gnssAccuracyMeters,
          gnssSpeedMps: data.speedMps,
          gnssHeadingDeg: data.headingDeg,
          accelerometerX: data.accelX,
          accelerometerY: data.accelY,
          accelerometerZ: data.accelZ,
          gyroscopeX: data.gyroX,
          gyroscopeY: data.gyroY,
          gyroscopeZ: data.gyroZ,
          altitude: data.altitude,
        ));
      }),
    );

    // 2. A/E Fusion → MovementState machine
    _subscriptions.add(
      fusionEngine.stateUpdates.listen((fusedState) {
        movementState.updateFromSensors(
          speedMps: fusedState.speedMps,
          headingDeg: fusedState.headingDeg,
          gnssAccuracy: fusedState.gnssAccuracyMeters,
          gnssAvailable: fusedState.isGnssAvailable,
          wifiAvailable: fusedState.isWifiAvailable,
          bluetoothAvailable: fusedState.isBluetoothAvailable,
          altitude: fusedState.altitude,
          sensorWeights: fusedState.sensorContributions,
        );
        bus.emit(SensorUpdateEvent(fusedState));
      }),
    );

    // 3. Sensor → Navigation position updates
    _subscriptions.add(
      sensorService.dataStream.listen((data) {
        if (data.position != null) {
          navigationEngine.updatePosition(
            data.position!,
            data.speedMps ?? 0.0,
            data.headingDeg,
          );

          // Drive IN follow camera while active.
          if (inEngine.isActive) {
            inEngine.update(
              data.position!,
              data.speedMps ?? 0.0,
              data.headingDeg,
            );
            final pose = inEngine.getCurrentCameraPose();
            inRenderer.updateCameraPose(pose);
            mapRenderer.updateCamera(pose);
          }

          // Check arrival.
          if (navigationEngine.checkArrival(data.position!)) {
            appState.transition(AppState.arrival);
            sonicEngine.enqueueArrival('your destination');
            stopNavigation();
          }
        }
      }),
    );

    // 4. Disruption events → DisruptionState + Sonic + Renderer
    _subscriptions.add(
      disruptionEngine.events.listen((event) {
        if (event is DisruptionDetected) {
          disruptionRenderer.addDisruption(event.disruption);
          mapRenderer.renderDisruptions(disruptionRenderer.activeRings
              .map((r) => r.disruption)
              .toList());
          sonicEngine.enqueueDisruption(event.disruption.title);
          bus.emit(DisruptionDetectedEvent(event.disruption));
          appState.transition(AppState.disruption);
        } else if (event is DisruptionCommitted) {
          filamentRenderer.loadFilament(event.newFilament);
          mapRenderer.renderFilament(event.newFilament);
          appState.transition(AppState.navigation);
          bus.emit(RerouteEvent(event.newFilament));
        } else if (event is DisruptionCleared) {
          disruptionRenderer.removeDisruption(event.id);
          bus.emit(DisruptionClearedEvent(event.id));
        }
      }),
    );

    // 5. Flow ribbon updates → FlowRenderer → MapRenderer
    _subscriptions.add(
      flowEngine.ribbonUpdates.listen((ribbon) {
        flowRenderer.loadRibbon(ribbon);
        mapRenderer.renderFlowRibbons(
          flowRenderer.getAllCells().isNotEmpty
              ? [ribbon]
              : [],
        );
      }),
    );

    // 6. Mapbox camera updates → bus
    _subscriptions.add(
      mapboxService.cameraUpdates.listen((pose) {
        bus.emit(CameraMoveEvent(pose));
      }),
    );
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  ManeuverInstruction _departInstruction(LatLng origin) {
    return ManeuverInstruction(
      text: 'Depart',
      type: ManeuverType.depart,
      distanceMeters: 0,
      bearingBefore: 0,
      bearingAfter: 0,
      coordinate: origin,
    );
  }
}
