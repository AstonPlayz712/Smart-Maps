import 'dart:async';
import 'dart:math' as math;
import '../models/route_filament.dart';
import '../models/flow_ribbon.dart';
import '../models/compliance_zone.dart';
import '../models/disruption_node.dart';
import '../models/weather_overlay.dart';
import '../models/camera_pose.dart';
import '../models/corridor.dart';
import '../services/mapbox_service.dart';

// ─── MapRenderer ─────────────────────────────────────────────────────────────

/// Orchestrates all Mapbox layer rendering.
///
/// Translates domain objects (RouteFilament, FlowRibbon, etc.) into layer
/// enable/disable and data-source update operations on [MapboxService].
class MapRenderer {
  late MapboxService _service;

  RouteFilament? _activeFilament;
  final List<FlowRibbon> _activeRibbons = [];
  final List<ComplianceZone> _activeZones = [];
  final List<DisruptionNode> _activeDisruptions = [];
  WeatherOverlay? _weatherOverlay;

  bool _buildings3dEnabled = false;
  bool _indoorEnabled = false;
  bool _tunnelsEnabled = false;
  bool _microMobilityEnabled = false;

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  void initialize(MapboxService service) {
    _service = service;
  }

  // ─── Route filament ─────────────────────────────────────────────────────────

  void renderFilament(RouteFilament filament) {
    _activeFilament = filament;

    // Enable corridor layers for road/ferry segments.
    final hasTunnel =
        filament.corridors.any((c) => c.type == CorridorType.tunnel);
    final hasIndoor =
        filament.corridors.any((c) => c.type == CorridorType.indoor);

    _service.enableLayer(MapLayer.corridors);
    if (hasTunnel) _service.enableLayer(MapLayer.tunnels);
    if (hasIndoor) _service.enableLayer(MapLayer.indoorFloors);

    _syncLayers();
  }

  void clearFilament() {
    _activeFilament = null;
    _service.disableLayer(MapLayer.corridors);
    _service.disableLayer(MapLayer.tunnels);
    _syncLayers();
  }

  // ─── Flow ribbons ────────────────────────────────────────────────────────────

  void renderFlowRibbons(List<FlowRibbon> ribbons) {
    _activeRibbons
      ..clear()
      ..addAll(ribbons);
    if (ribbons.isNotEmpty) {
      _service.enableLayer(MapLayer.flowRibbons);
    }
    _syncLayers();
  }

  void clearRibbons() {
    _activeRibbons.clear();
    _service.disableLayer(MapLayer.flowRibbons);
    _syncLayers();
  }

  // ─── Compliance zones ────────────────────────────────────────────────────────

  void renderComplianceZones(List<ComplianceZone> zones) {
    _activeZones
      ..clear()
      ..addAll(zones);
    if (zones.isNotEmpty) {
      _service.enableLayer(MapLayer.complianceZones);
    }
    _syncLayers();
  }

  void clearComplianceZones() {
    _activeZones.clear();
    _service.disableLayer(MapLayer.complianceZones);
    _syncLayers();
  }

  // ─── Disruptions ─────────────────────────────────────────────────────────────

  void renderDisruptions(List<DisruptionNode> disruptions) {
    _activeDisruptions
      ..clear()
      ..addAll(disruptions);
    if (disruptions.isNotEmpty) {
      _service.enableLayer(MapLayer.disruptionRings);
    }
    _syncLayers();
  }

  void clearDisruptions() {
    _activeDisruptions.clear();
    _service.disableLayer(MapLayer.disruptionRings);
    _syncLayers();
  }

  // ─── Weather ─────────────────────────────────────────────────────────────────

  void renderWeatherOverlay(WeatherOverlay overlay) {
    _weatherOverlay = overlay;
    _service.enableLayer(MapLayer.weather);
    _syncLayers();
  }

  void clearWeatherOverlay() {
    _weatherOverlay = null;
    _service.disableLayer(MapLayer.weather);
    _syncLayers();
  }

  // ─── Style ───────────────────────────────────────────────────────────────────

  void setStyle(MapStyleMode mode) => _service.setStyleMode(mode);

  void enable3DBuildings(bool enable) {
    _buildings3dEnabled = enable;
    if (enable) {
      _service.enableLayer(MapLayer.buildings3d);
    } else {
      _service.disableLayer(MapLayer.buildings3d);
    }
  }

  void enableIndoorLayers(bool enable) {
    _indoorEnabled = enable;
    if (enable) {
      _service.enableLayer(MapLayer.indoorFloors);
    } else {
      _service.disableLayer(MapLayer.indoorFloors);
    }
  }

  void enableTunnelGeometry(bool enable) {
    _tunnelsEnabled = enable;
    if (enable) {
      _service.enableLayer(MapLayer.tunnels);
    } else {
      _service.disableLayer(MapLayer.tunnels);
    }
  }

  void enableMicroMobilityZones(bool enable) {
    _microMobilityEnabled = enable;
    if (enable) {
      _service.enableLayer(MapLayer.microMobility);
    } else {
      _service.disableLayer(MapLayer.microMobility);
    }
  }

  // ─── Camera ──────────────────────────────────────────────────────────────────

  void updateCamera(CameraPose pose) => _service.setCameraPose(pose);

  // ─── Accessors ───────────────────────────────────────────────────────────────

  RouteFilament? get activeFilament => _activeFilament;
  List<FlowRibbon> get activeRibbons => List.unmodifiable(_activeRibbons);
  List<ComplianceZone> get activeZones => List.unmodifiable(_activeZones);
  List<DisruptionNode> get activeDisruptions =>
      List.unmodifiable(_activeDisruptions);
  WeatherOverlay? get weatherOverlay => _weatherOverlay;

  // ─── Layer sync ───────────────────────────────────────────────────────────────

  void _syncLayers() {
    // Re-apply persistent feature flags.
    if (_buildings3dEnabled) _service.enableLayer(MapLayer.buildings3d);
    if (_indoorEnabled) _service.enableLayer(MapLayer.indoorFloors);
    if (_tunnelsEnabled) _service.enableLayer(MapLayer.tunnels);
    if (_microMobilityEnabled) _service.enableLayer(MapLayer.microMobility);
  }
}
