# Smart Maps — native iOS engine

SM on iOS is a **private core module behind a single public interface**, bound
to real Apple frameworks, scaling its fidelity to the host OS.

## Module layout

```
native/ios/
  project.yml                      two targets — the boundary is compiler-enforced
  SMCore/                          ← the private core module (framework)
    Public/                        THE public surface — nothing else is reachable
      SMNavigationController.swift   start / stop / setDestination / liveState / status
      SMPublicTypes.swift            SMLiveState, SMStatus, SMDestination, SMFidelityTier…
    Core/                          internal engines
      SMCoreEngine.swift             orchestrator, one tick loop
      SMDeadReckoning.swift          DR v3 (iOS 27) + DR v2 (26/17)
      SMMotionEngine.swift           motion engine + motion prediction (27 only)
      SMLaneGeometry.swift           lane geometry
      SMMultiLevelRoads.swift        multi-level roads
      SMSatelliteEngine.swift        satellite engine (27/26)
      SMTrafficEngine.swift          traffic engine
      SMDimensionalEngine.swift      the 3D–7D engine
      LocationFusionEngine / SpatialEngine / RoutingEngine / OfflineGeometryCache / Models
    Adapters/                      real framework bindings
      SMLocationAdapter.swift        CoreLocation
      SMMotionAdapter.swift          CoreMotion
      SMMapAdapter.swift             MapKit (MKMapView)
    Rendering/
      SMRenderingEngine.swift        Metal device + SceneKit scene graph
    Fidelity/
      SMFidelityScalingEngine.swift  OS detection → capability profile
    Debug/
      SMDebugOverlay.swift           internal dev overlay (DEBUG only)
  SmartMapsAE/                     ← the app: UI only, no engine logic
    SmartMapsAEApp.swift
    UI/SMRootView.swift
```

`SMCore` is a framework target. Everything in it is `internal` except
`SMNavigationController` and the value types it returns, so the app target
**cannot** reference an engine, adapter or renderer even by accident.

## Fidelity scaling

| | iOS 27 — Full | iOS 26 — Satellite | iOS 17 — Modern |
|---|---|---|---|
| Dead reckoning | **v3** (inertial + ZUPT) | v2 | v2 |
| Motion prediction | ✅ | — | — |
| Satellite engine | ✅ | ✅ | — |
| Lane geometry | maximum | high | standard |
| Multi-level roads | maximum | high | standard (off) |
| Rendering | HDR + shadows + lanes | high | standard |
| Map config | realistic elevation | realistic elevation | flat |
| Tick rate | 20 Hz | 15 Hz | 10 Hz |

Tier selection uses `ProcessInfo.operatingSystemVersion`, not `#available`, so
it resolves correctly on an OS **newer than the SDK** the binary was built
against. Any call that needs a newer SDK is still `#available`-guarded at its
call site.

## Real frameworks

| Was | Now |
|---|---|
| simulated fixes | **CoreLocation** `CLLocationManager` (GNSS/Wi-Fi/cell inferred from accuracy tier), real heading |
| simulated IMU | **CoreMotion** `CMMotionManager` device motion + `CMMotionActivityManager` walking/driving |
| hand-drawn Canvas "map" | **MapKit** `MKMapView` — Apple tiles, traffic, realistic elevation, overlays, annotations, gestures |
| no renderer | **Metal** device + **SceneKit** scene graph (3D geometry, 4D pose, 5D lighting/fog, 6D traffic tint, 7D sky ambient) |
| external debug logic | **SMDebugOverlay**, internal, `#if DEBUG` only |

## Public API

```swift
let sm = SMNavigationController()
sm.startNavigation()
sm.setDestination(coordinate: CLLocationCoordinate2D(latitude: 51.5, longitude: -0.12))
let state  = sm.getLiveState()   // coords, accuracy, motion, confidence, sources, Hz, 3D–7D
let status = sm.getStatus()      // engine state, tier, DR version, capabilities, route
sm.stopNavigation()
```

`mapView()` / `sceneView()` vend the native surfaces; `debugOverlay()` exists
only in DEBUG builds.

## Known limitation — iOS 27 APIs

iOS 27 has no published SDK as of this work. The **tier is real** (detected at
runtime, and it selects DR v3, motion prediction, maximum geometry and
rendering), but it is built from APIs available in the iOS 17–26 SDKs. If iOS 27
ships navigation-specific APIs worth adopting, they slot into the tier-gated
branches already in place — no restructuring needed.
