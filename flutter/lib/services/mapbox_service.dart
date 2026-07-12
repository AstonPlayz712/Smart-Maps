import 'dart:async';
import '../models/latlng.dart';
import '../models/camera_pose.dart';

// ─── Map layer enum ───────────────────────────────────────────────────────────

enum MapLayer {
  buildings3d,
  corridors,
  indoorFloors,
  tunnels,
  flowRibbons,
  complianceZones,
  weather,
  inCallouts,
  disruptionRings,
  microMobility,
}

enum MapStyleMode { day, dusk, night }

// ─── MapboxService ────────────────────────────────────────────────────────────

/// Abstraction over the Mapbox Maps Flutter SDK.
///
/// All camera and layer operations go through this class so the rest of the
/// engine remains SDK-agnostic.  The actual SDK calls are made here and are
/// clearly labelled where the Mapbox plugin integration points are.
class MapboxService {
  String _accessToken = '';
  final Set<MapLayer> _enabledLayers = {};
  MapStyleMode _styleMode = MapStyleMode.day;
  CameraPose? _currentPose;

  final _cameraController = StreamController<CameraPose>.broadcast();
  final _layerController = StreamController<Set<MapLayer>>.broadcast();

  bool _initialized = false;

  // ─── Initialisation ─────────────────────────────────────────────────────────

  void initialize(String accessToken) {
    _accessToken = accessToken;
    _initialized = true;
    // Integration point: MapboxMap widget is initialised by the UI layer and
    // passes a MapboxMap controller back to this service via setController().
  }

  bool get isInitialized => _initialized;

  // ─── Layers ─────────────────────────────────────────────────────────────────

  void enableLayer(MapLayer layer) {
    if (_enabledLayers.add(layer)) {
      _layerController.add(Set.unmodifiable(_enabledLayers));
    }
  }

  void disableLayer(MapLayer layer) {
    if (_enabledLayers.remove(layer)) {
      _layerController.add(Set.unmodifiable(_enabledLayers));
    }
  }

  void toggleLayer(MapLayer layer) {
    if (_enabledLayers.contains(layer)) {
      disableLayer(layer);
    } else {
      enableLayer(layer);
    }
  }

  bool isLayerEnabled(MapLayer layer) => _enabledLayers.contains(layer);

  Set<MapLayer> get enabledLayers => Set.unmodifiable(_enabledLayers);

  // ─── Style ──────────────────────────────────────────────────────────────────

  void setStyleMode(MapStyleMode mode) {
    if (_styleMode == mode) return;
    _styleMode = mode;
    // Integration point: mapController.loadStyleURI(getStyleUrl(mode));
  }

  MapStyleMode get styleMode => _styleMode;

  String getStyleUrl(MapStyleMode mode) {
    switch (mode) {
      case MapStyleMode.day:
        return 'mapbox://styles/mapbox/streets-v12';
      case MapStyleMode.dusk:
        return 'mapbox://styles/mapbox/navigation-guidance-night-v4';
      case MapStyleMode.night:
        return 'mapbox://styles/mapbox/navigation-night-v1';
    }
  }

  // ─── Camera ─────────────────────────────────────────────────────────────────

  void setCameraPose(CameraPose pose) {
    _currentPose = pose;
    _cameraController.add(pose);
    // Integration point: mapController.setCamera(CameraOptions(...));
  }

  CameraPose? get currentPose => _currentPose;

  void animateCamera(
    CameraPose target, {
    Duration duration = const Duration(milliseconds: 800),
  }) {
    // Integration point: mapController.flyTo(CameraOptions(...), MapAnimationOptions(duration: ...));
    Future<void>.delayed(duration, () {
      setCameraPose(target);
    });
  }

  void flyTo(
    LatLng center, {
    double zoom = 15,
    double pitch = 0,
    double bearing = 0,
    Duration duration = const Duration(milliseconds: 2000),
  }) {
    animateCamera(
      CameraPose(
        center: center,
        zoom: zoom,
        pitch: pitch,
        bearing: bearing,
      ),
      duration: duration,
    );
  }

  // ─── Streams ────────────────────────────────────────────────────────────────

  Stream<CameraPose> get cameraUpdates => _cameraController.stream;

  Stream<Set<MapLayer>> get layerUpdates => _layerController.stream;

  // ─── Cleanup ────────────────────────────────────────────────────────────────

  void dispose() {
    _cameraController.close();
    _layerController.close();
  }
}
