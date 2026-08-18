# Hybrid → Native Migration

Instructions and the module-by-module map for replacing the hybrid stack with
native equivalents. The TS sources stay in-repo as the algorithm reference
(and browser dev harness) until native parity is signed off, then they can be
deleted; nothing hybrid ships to a device from this commit onward.

## Removed in this commit

| Artifact | Why | Replacement |
|----------|-----|-------------|
| `android/` (Capacitor project) | WebView shell | `native/android` (Kotlin + Compose) |
| `ios/` (Capacitor project) | WKWebView shell | `native/ios` (Swift + SwiftUI) |
| `capacitor.config.ts`, `capacitor.config.json` | Capacitor artifacts | none needed |
| root `gradlew`, `gradlew.bat` | Appflow build shims (ran web build + cap sync) | `native/android/gradlew` |
| `@capacitor/*` dependencies | JS bridge | none — no bridges exist |
| Capacitor branches in `SpotifyAuth.ts` | JS-bridge deep-link flow | pure web PKCE flow in the harness; native apps will use platform OAuth (ASWebAuthenticationSession / Custom Tabs) when media lands natively |
| CI `main-app` job (Capacitor APK) | built the hybrid app | builds `native/android` Compose APK |

## Module map (TS reference → native equivalents)

| TS reference (spec source) | Android (Kotlin) | iOS (Swift) |
|---|---|---|
| `src/logic/SensorFusionCore.ts` + location providers | `core/LocationFusionEngine.kt` + `sensors/SensorHub.kt` | `Core/LocationFusionEngine.swift` + `Sensors/SensorHub.swift` |
| `src/logic/MotionConfidenceEngine.ts` | `core/MovementEngine.kt` | `Core/MovementEngine.swift` |
| `src/logic/RouteManager.ts` (chainage projection, corridor lock) | `core/SpatialEngine.kt` | `Core/SpatialEngine.swift` |
| `src/logic/DeadReckoningEngine.ts` (IMU-decayed advance) | `core/DeadReckoningEngine.kt` | `Core/DeadReckoningEngine.swift` |
| `src/sm/routing/Routing.ts` + `src/logic/PredictiveEngine.ts` | `core/RoutingEngine.kt` (A* + ETA + turn-by-turn) | `Core/RoutingEngine.swift` |
| `src/sm/real-time-engine/RealTimeEngine.ts` | `core/TransportTimeEngine.kt` | `Core/TransportTimeEngine.swift` |
| `core/zante/native/assets/AssetLoader.ts` (residency cache) | `core/OfflineGeometryCache.kt` | `Core/OfflineGeometryCache.swift` |
| `src/logic/SMCore.ts` (8-step tick) | `core/AECore.kt` | `Core/AECore.swift` |
| React screens (`src/components/*`) | `ui/*Screen.kt` (Compose) | `UI/*Screen.swift` (SwiftUI) |
| MapLibre GL rendering | `ui/MapSurface.kt` (Compose Canvas, engine geometry) | `UI/MapSurface.swift` (SwiftUI Canvas) |

## How to replace remaining hybrid code

1. **Pick the TS module** from the left column — it is the behavioural spec.
   Port semantics, constants and hysteresis exactly; don't redesign in-port.
2. **Land it in both `native/android/.../core/` and `native/ios/.../Core/`**
   with the same name and model shapes. A module missing on one platform
   simply doesn't activate there (no fallback, no shim).
3. **Wire it into `AECore`'s tick** — engines only ever meet in the
   orchestrator; they never call each other directly.
4. **Delete the TS module** once both native ports match its behaviour
   (drive the browser harness and the native app on the same recorded
   sensor trace and compare outputs).
5. Never add a WebView, JS bridge, or HTML/CSS surface to `native/` — that is
   a regression against the A/E charter and this migration.

## What still runs from the old world (and why that's fine)

- The Vite web app builds and runs in a **browser only** — it's the reference
  harness for the TS layers and the fastest place to iterate on algorithm
  changes before porting them. It has no mobile packaging path anymore.
- `devshell/` remains the native GPU/JNI sandbox; the Zante native renderer
  work (Stage 2+) lands there and in `native/` — never in the web harness.

## Build instructions

```sh
# Android (JDK 17)
cd native/android && ./gradlew assembleDebug
# APK: native/android/app/build/outputs/apk/debug/

# iOS (Xcode 15+, xcodegen: brew install xcodegen)
cd native/ios && xcodegen generate && open SmartMapsAE.xcodeproj
```
