# Smart Maps A/E — Native Architecture

Repo analysis + the proposed (and implemented) fully native structure. A/E is
the core architecture: no basic mode, no fallback logic, modules activate only
when implemented, everything automatic and dynamic.

## 1. Repo analysis (what was here)

| Layer | What it was | Verdict |
|-------|-------------|---------|
| `android/` | Capacitor 6 Android project wrapping a WebView around the Vite bundle | **Hybrid — removed** |
| `ios/` | Capacitor iOS project (WKWebView shell) | **Hybrid — removed** |
| `capacitor.config.ts/json`, root `gradlew` shims | Appflow/Capacitor build artifacts | **Hybrid — removed** |
| `@capacitor/*` npm deps | JS bridge surface (only `SpotifyAuth.ts` imported them) | **Hybrid — removed** (SpotifyAuth patched to pure web flow) |
| `src/` (React + MapLibre + TS) | The Z Build web app + the A/E TS layers (`src/logic`, `core/`, `engine/`, `automaps/`) | **Reference implementation** — stays as the porting spec and browser dev harness; ships nothing mobile |
| `devshell/` | Native Kotlin + JNI + CMake sandbox (Capacitor-free) | **Native — kept**; its toolchain pins (Gradle 8.2.1 / AGP 8.2.1 / Kotlin 1.9.10, JDK 17) seed the new native app |
| `.github/workflows/android-builds.yml` | Built the Capacitor APK + DevShell APK | **Repointed** — main job now builds the native Compose app |

The TS A/E logic (`src/logic/`) is the algorithm source of truth: corridor
chainage projection, hysteretic corridor lock, IMU-decayed dead reckoning,
motion-confidence hysteresis. The native engines below are ports of those
algorithms, not reinventions — behaviour parity is the migration contract.

## 2. Native structure

```
native/
  android/                      Kotlin + Jetpack Compose (com.smartmaps.ae)
    app/src/main/java/com/smartmaps/ae/
      core/                     A/E All-In-One Core (platform-native, no bridges)
        Models.kt               shared data models
        LocationFusionEngine.kt GPS + Wi-Fi(network) + BT + cell + IMU fusion
        MovementEngine.kt       accelerometer + gyro + smoothing → motion state
        SpatialEngine.kt        road snapping + geometry alignment (chainage)
        DeadReckoningEngine.kt  IMU integration + drift clamping to corridor
        RoutingEngine.kt        A* + ETA + turn-by-turn generation
        TransportTimeEngine.kt  bus/train/tube feed providers + arrivals
        OfflineGeometryCache.kt local road-graph tile store (files, no cloud)
        AECore.kt               all-in-one orchestrator (single tick loop)
      sensors/SensorHub.kt      LocationManager + SensorManager wiring → AECore
      ui/                       Jetpack Compose only — no HTML/CSS, no WebView
        HomeScreen.kt           search + quick modes
        NavigationScreen.kt     native map surface + snapped position + instructions
        TransitScreen.kt        arrivals / departures
        JourneyPlannerScreen.kt start → destination
        MapSurface.kt           Compose Canvas corridor renderer (Zante-style)
        theme/Theme.kt
      MainActivity.kt, SmartMapsApp.kt (NavHost + bottom bar)
  ios/                          Swift + SwiftUI (SmartMapsAE)
    project.yml                 XcodeGen manifest (generates the .xcodeproj)
    SmartMapsAE/
      Core/                     same seven engines + AECore, in Swift
      Sensors/SensorHub.swift   CoreLocation + CoreMotion wiring
      UI/                       SwiftUI only — Home, Navigate, Transit, Planner,
                                MapSurface (SwiftUI Canvas corridor renderer)
      SmartMapsAEApp.swift
  ARCHITECTURE.md               this file
  MIGRATION.md                  hybrid → native replacement instructions
```

Shared logic is **platform-native on both sides** (rule 3): the same algorithms
exist as Kotlin and Swift modules with identical names, models and semantics.
There is no cross-platform runtime, no bridge, no codegen — parity is enforced
by the migration map in MIGRATION.md.

## 3. The A/E All-In-One Core (both platforms)

One orchestrator (`AECore`) owns every engine and drives a single dynamic tick:

```
SensorHub ──► LocationFusionEngine ─┐
          ──► MovementEngine ───────┤
                                    ▼
                    SpatialEngine (snap to road graph)
                                    │  weak/absent fix?
                    DeadReckoningEngine (IMU advance, drift-clamped)
                                    ▼
                    RoutingEngine (A* route, ETA, next instruction)
                                    ▼
              UI state (StateFlow / @Published) → Compose / SwiftUI
```

- **Automatic**: engines activate when their inputs exist — a module with no
  data contributes nothing and nothing waits on it. No mode switches, no
  configuration, no basic mode.
- **Dynamic**: every output is recomputed per tick from live sensors; there are
  no scripted transitions and no pre-baked paths.
- **Connectivity-agnostic**: the road graph comes from OfflineGeometryCache;
  routing, snapping and DR run entirely offline. Transport feeds enrich when
  reachable and simply don't exist when not (no fallback logic — absence is
  absence).
- **Movement-aware**: MovementEngine classifies still/walking/driving from
  IMU energy and gates fusion + DR with it.
- **Geometry-aware**: SpatialEngine's chainage projection (ported from the TS
  `RouteManager`) is the spine — position, DR, routing and rendering all
  address the world by corridor chainage.

## 4. UI (native only)

Four screens per platform, Compose and SwiftUI respectively, driven directly
by AECore state. The map surface is a native canvas renderer that draws the
road graph, corridor, route and snapped position from engine geometry —
no map SDK, no web tiles, no WebView. It is the mobile expression of the
Zante renderer: engine-owned geometry drawn natively.

## 5. Build + CI

- Android: `native/android` is a self-contained Gradle project (wrapper
  included) — `./gradlew assembleDebug`. CI's main job builds it on JDK 17.
- iOS: `native/ios/project.yml` + XcodeGen (`xcodegen generate`) produces the
  Xcode project; build with Xcode 15+. CI iOS lane can be added when a macOS
  runner is available.
- The web app remains buildable (`npm run build`) purely as the reference
  harness for the TS layers; it is not shipped to any device.
