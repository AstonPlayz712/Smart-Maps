# Smart Maps OS

A unified **SM · IN · AM** proto. Three coordinated modules — Smart Maps (renderer),
Immersive Navigation (camera engine), and Ask Maps (AI command layer) — running inside
one engine, in the browser, with London and Zante (Zakynthos) in 3D.

```
                ┌──────────────────────────────────────────┐
                │           NavigationService              │
                │                                          │
                │   owns: location · destination · route   │
                │         state (idle/starting/navigating/ │
                │                arrived/stopped)          │
                │                                          │
                │   exposes:                               │
                │     startNavigation(dest)                │
                │     stopNavigation()                     │
                │     onLocationUpdate(cb)                 │
                │     onRouteUpdate(cb)                    │
                │     onNavigationStateChange(cb)          │
                └──────────┬─────────────┬─────────────────┘
                           │             │
       ┌───────────────────┘             └─────────────────┐
       ▼                                                   ▼
  ╔═════════╗     ╔════════════╗     ╔══════════╗     ╔══════════╗
  ║   UI    ║     ║  Ask Maps  ║     ║ AutoLink ║     ║          ║
  ╚═════════╝     ╚════════════╝     ╚══════════╝     ║   ...    ║
       │               │                  │           ║          ║
       │               │                  │           ╚══════════╝
       └───────────────┴──────────────────┘
              (every module talks to the service,
               not to the engine, for navigation)

 ┌──────────────────────────────────────────────────────────────────┐
 │                       SmartMapsEngine                            │
 │                                                                  │
 │   ┌──────────────┐    ┌─────────────────────┐    ┌────────────┐  │
 │   │ SmartMaps    │    │ Immersive           │    │ Ask Maps   │  │
 │   │ Renderer     │    │ Navigation          │    │ (NL → cmd) │  │
 │   │              │    │                     │    │            │  │
 │   │ MapLibre +   │    │ CinematicCamera     │    │ Parser +   │  │
 │   │ 3D buildings │    │ RouteEngine         │    │ Registry   │  │
 │   │ + terrain +  │    │                     │    │            │  │
 │   │ sky          │    │ fly / orbit / tour  │    │ executes   │  │
 │   │              │    │ drawRoute (prim.)   │    │ against    │  │
 │   └──────┬───────┘    └──────────┬──────────┘    │ engine +   │  │
 │          │                       │               │ service    │  │
 │          └───────────┬───────────┘               └─────┬──────┘  │
 │                     EventBus  ◀─── shared event channel ─────────┘
 └──────────────────────────────────────────────────────────────────┘
```

## What works

- 3D **MapLibre GL** scene with extruded buildings, terrain (AWS Open Terrain DEM), and sky.
- Two preset locations: **London** (dense city core) and **Zante** (Zakynthos / Navagio).
- **Tap-to-route** anywhere on the map — the engine plots a polyline from the user's
  location (or map centre if geolocation is denied) and shows distance / walk time.
- **Cinematic camera**: smooth `fly`, continuous `orbit`, multi-stop `tour`.
- **Ask Maps** natural-language bar — try `fly to Tower Bridge`, `orbit Navagio`,
  `route to Big Ben`, `show 3D buildings`, `cinematic tour`, `night mode`, `tilt 75`, `help`.

## Run it

```bash
npm install
npm run dev      # vite dev server on http://localhost:5173
```

Production build:

```bash
npm run build
npm run preview
```

No API keys required. Tiles come from [OpenFreeMap](https://openfreemap.org)
(OpenMapTiles schema, including building polygons) and terrain DEM tiles
from AWS's public Open Terrain bucket.

## iOS build via Ionic Appflow

The repo is wired up for [Capacitor](https://capacitorjs.com) 6 with an iOS
native project under `ios/App/`. Appflow builds the iOS binary in the cloud —
no local Xcode required. The whole flow from your phone is:

1. **Push the branch to GitHub** (`claude/build-smart-maps-engine-YbFwj` or main).
2. In Appflow, connect this repo to a new app (if not already done). Pick the
   branch you want to build.
3. Add a **signing certificate** to Appflow (Account → Certificates) — even
   for development builds you need a provisioning profile / signing identity.
4. Start an **iOS Native build**:
   - Platform: **iOS**
   - Build type: **Development** (or Ad Hoc, when distributing to test
     devices outside your team)
   - Web build: **Auto** (Appflow runs `npm ci` then `npm run build`)
   - Capacitor sync: **Yes** (Appflow auto-runs `npx cap sync ios`)
   - Signing certificate: the one from step 3
5. When the build completes, Appflow surfaces an installer link. Open it on
   the iPhone 11 in **Safari** → **Install**. iOS may ask you to trust the
   developer profile under **Settings → General → VPN & Device Management**.

The Capacitor + iOS scaffolding is already committed:

- `capacitor.config.ts` — appId `com.smartmaps.os`, appName `Smart Maps OS`,
  webDir `dist`, server.cleartext `true`.
- `ios/App/Podfile` — pulls `Capacitor` and `CapacitorCordova` from the
  `@capacitor/ios` npm package.
- `ios/App/App.xcodeproj` — Xcode project with Debug + Release configurations,
  iOS 13 deployment target, automatic code signing, bundle id
  `com.smartmaps.os`.
- `ios/App/App/Info.plist` — declares location, motion, Bluetooth, and local
  network permission strings. Background modes are declared in a comment
  block, **disabled** for the proto (uncomment when you actually need
  background location).
- `ios/App/App/{AppDelegate,ViewController,CapacitorBridge}.swift` — standard
  Capacitor bridge wiring.
- `ios/App/App/public/` — placeholder; Appflow's sync step replaces it with
  the Vite `dist/` build on every run (gitignored).

**Permissions baked into Info.plist:**
- `NSLocationWhenInUseUsageDescription`
- `NSLocationAlwaysAndWhenInUseUsageDescription`
- `NSLocationAlwaysUsageDescription`
- `NSMotionUsageDescription`
- `NSBluetoothAlwaysUsageDescription`, `NSBluetoothPeripheralUsageDescription`
- `NSLocalNetworkUsageDescription`

The AutoEx `LocalWebSocketTransport` now self-disables when it detects it's
running inside Capacitor — no more 1.5 s connect timeouts to `ws://localhost`
on the device. Wi-Fi Direct, BLE, and the bridge as a whole still fail
gracefully if no transport is available; the app continues to function as a
pure-host map with no companion link.

## Android build via Ionic Appflow

The Android platform sits next to iOS under `android/`. Package id is
`com.smartmaps.handheld`, min SDK 23, target SDK 34, `versionCode 1`,
`versionName "1.0.0"`. Kotlin `MainActivity` extending `BridgeActivity`.
Release builds enable `minifyEnabled` + `shrinkResources` so the AAB lands
under Google Play's size limits.

**Manifest permissions:** `INTERNET`, `ACCESS_NETWORK_STATE`,
`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACTIVITY_RECOGNITION`.

**Appflow → AAB:**

1. Push the branch.
2. In Appflow, **New build → Android**.
3. Build type: **Release**.
4. Build format: **Android App Bundle (.aab)**.
5. Web build: **Auto** (Appflow runs `npm ci` then `npm run build`).
6. Capacitor sync: **Yes** (Appflow runs `npx cap sync android`).
7. Signing certificate: upload your **upload keystore** (Account → Certificates → Android). For internal testing you can use a debug keystore; for Play Store you need an upload key Google can verify.
8. Start build. Appflow runs Gradle and produces an `app-release.aab`.

**Google Play Console → first upload:**

1. In Play Console create a new app: name **Smart Maps OS**, default language English, app type **App**, free.
2. Complete the **App content** declarations (privacy policy URL, target audience, data safety form — location is collected, motion is collected; no data sold).
3. Set up **App access** (if any sign-in is required — for this proto, mark "All functionality is available without restrictions").
4. **Production → Create new release** (or **Internal testing** for first round).
5. Upload the AAB from Appflow.
6. Fill in release notes, save, **Send for review**.
7. For the first version Google may require completing the data-safety questionnaire, content rating, and a privacy policy URL hosted somewhere public.

**Sideload-only path (no Play Store):**

- In Appflow build, choose **APK** instead of AAB.
- Download the APK from the build summary on your phone.
- Open it; Android prompts to install from unknown sources — allow once.

The AutoEx WebSocket transport already self-disables inside Capacitor on
Android too, so no `ws://localhost` connect attempts happen on the device.

## Architecture

The repo is organised so each module is independently swappable:

```
src/
├── engine/
│   ├── SmartMapsEngine.ts      ← conductor: owns renderer/nav/askMaps/service
│   ├── EventBus.ts             ← typed pub/sub
│   ├── types.ts                ← shared types (CameraPose, POI, events)
│   └── config.ts               ← tile URLs, terrain config
├── services/
│   ├── NavigationService.ts    ← THE NAVIGATION KERNEL (state + subscribers)
│   └── location-providers/     ← THE LOCATION KERNEL (multi-provider facade)
│       ├── LocationProviders.ts
│       ├── BaseLocationProvider.ts
│       ├── types.ts
│       └── providers/
│           ├── WiFiProvider.ts
│           ├── BluetoothBeaconProvider.ts
│           ├── AutoLinkLocationProvider.ts
│           ├── SensorFusionProvider.ts
│           └── ManualProvider.ts
├── modules/
│   ├── smart-maps/             ← THE RENDERER
│   │   ├── SmartMapsRenderer.ts
│   │   ├── layers.ts           ← 3D buildings, sky
│   │   └── locations.ts        ← London + Zante presets
│   ├── immersive-navigation/   ← THE CAMERA ENGINE
│   │   ├── ImmersiveNavigation.ts
│   │   ├── CinematicCamera.ts
│   │   ├── RouteEngine.ts
│   │   └── easing.ts
│   ├── ask-maps/               ← THE AI COMMAND LAYER
│   │   ├── AskMaps.ts
│   │   ├── CommandParser.ts
│   │   └── commandRegistry.ts
│   └── autolink/               ← EXTERNAL TRANSPORT BRIDGE  (folder kept;
│       │                         the name "AutoLink" is reserved for the AI
│       │                         router inside AutoOSM)
│       ├── AutoExBridge.ts     (transport-selecting facade, autoex channel)
│       └── transports/
│           ├── Transport.ts
│           ├── WiFiDirectTransport.ts
│           ├── BluetoothLETransport.ts
│           └── LocalWebSocketTransport.ts
├── components/                 ← thin React surfaces
│   ├── MapView.tsx
│   ├── AskMapsBar.tsx
│   ├── LocationSwitcher.tsx
│   ├── HUD.tsx
│   └── Toast.tsx
├── hooks/
│   └── useSmartMapsEngine.ts
├── data/
│   └── pois.ts
├── App.tsx
├── main.tsx
└── styles.css
```

## NavigationService

Every consumer that cares about routing — the UI, Ask Maps commands, the AutoLink
bridge — coordinates through `NavigationService`. It is the single source of truth
for:

- **current location** (live `watchPosition`, falls back to map center)
- **destination**
- **current route** (origin / destination / distance / ETA / start time)
- **navigation state** (`idle` → `starting` → `navigating` → `arrived` / `stopped`)
- **subscribers**, tagged per channel: `autolink` · `ask-maps` · `ui`

```ts
const off = engine.navigationService.onRouteUpdate((route) => {
  if (route) console.log(route.distanceMeters, route.durationSec);
}, 'ui');

engine.navigationService.startNavigation({ lng: -0.0754, lat: 51.5055 });
// later
engine.navigationService.stopNavigation();
off();
```

The engine deliberately no longer wires map clicks to routing itself — that
belongs to the UI. `App.tsx` binds `map.on('click', …)` to
`navigationService.startNavigation(...)`. Ask Maps commands like `route to Big Ben`
and `clear route` reach for `ctx.navigationService` rather than the engine's
`ImmersiveNavigation` directly. `AutoExBridge` subscribes to all three streams
on the `autoex` channel and forwards them out over whichever transport is live.

## AutoExBridge — external transport layer

`AutoExBridge` is the wire between Smart Maps OS and a companion device
(AutoOSM HUD, watch, glasses, …). The bridge picks the first available
transport at runtime:

| # | Transport          | Implementation                                                |
| - | ------------------ | ------------------------------------------------------------- |
| 1 | Wi-Fi Direct       | `navigator.wifi?.connect(...)` stub; opt-in dev simulation via `localStorage.setItem('smartmaps.wifidirect', 'enabled')` |
| 2 | Bluetooth LE       | Web Bluetooth, AutoEx service UUID `f3a01c00-9f7e-…`, reconnect at 1 s / 2 s / 4 s |
| 3 | Local WebSocket    | `ws://localhost:8765` JSON relay; dev fallback                |

Each transport implements the `Transport` interface
(`connect / disconnect / send / onMessage / getStatus`). `AutoExBridge` exposes
the facade:

```ts
const bridge = new AutoExBridge();
await bridge.connect();
bridge.send('navigation:state', { state: 'navigating' });
bridge.on('location:fix', (payload) => console.log(payload));
const { status, transport } = bridge.getStatus();
```

Outbound wiring: `bridge.attachNavigationService(engine.navigationService)`
subscribes to all three navigation streams and forwards them as
`navigation:state`, `navigation:route`, and `navigation:location` packets.

Inbound wiring: `bridge.attachLocationProvider(engine.locationProviders.getProvider('autoex'))`
pipes incoming `location:fix` packets into `AutoExLocationProvider.pushFix(...)`,
which surfaces them through `LocationProviders`. The fix's `source` is
`'autoex'` — set `setPrimaryProvider('autoex')` to make the OS run entirely off
the companion's positioning when the host has no GPS or SIM.

A dev-only `AutoExDebugOverlay` (mounted when `import.meta.env.DEV` is true)
shows the active transport, link status, the last packet sent/received, and
candidate transport availability.

> **Name note:** the directory is still `src/modules/autolink/` for path
> stability, but "AutoLink" is reserved for the AI router inside AutoOSM. The
> code uses `AutoEx` everywhere — the external bridge.

## LocationProviders

The OS keeps working on devices with no GPS and no SIM by abstracting the
"where am I?" question behind a small registry. `LocationProviders` holds one
instance of each source and decides which fix to commit:

| Provider                     | Source / Mechanism                                            |
| ---------------------------- | ------------------------------------------------------------- |
| `WiFiProvider`               | `navigator.geolocation` with `enableHighAccuracy: false` — OS-level Wi-Fi / cell positioning |
| `BluetoothBeaconProvider`    | Ingest `(beaconId, rssi)` detections; RSSI-weighted centroid across registered beacons |
| `AutoLinkLocationProvider`   | Receiver for fixes pushed over the AutoLink transport from a companion device |
| `SensorFusionProvider`       | DeviceMotion + DeviceOrientation dead reckoning, anchored by any absolute fix |
| `ManualProvider`             | Developer / user-set fixed coordinates; the floor that never fails |

```ts
const fix = engine.locationProviders.getLocation();

const off = engine.locationProviders.onLocationUpdate((fix) => {
  console.log(fix.source, fix.lat, fix.lng, fix.accuracy);
});

// Switch primary source. Useful when GPS is dark indoors.
engine.locationProviders.setPrimaryProvider('bluetooth');

// Push a beacon detection from a native shim:
engine.locationProviders.getProvider<BluetoothBeaconProvider>('bluetooth')
  ?.feedDetection('beacon-42', -68);

// Tell the system where you are when nothing else works:
engine.locationProviders.getProvider<ManualProvider>('manual')
  ?.setPosition(51.5007, -0.1245);
```

Acceptance policy:

- The primary provider's fixes are always committed.
- Other providers' fixes only commit when the primary has been silent for ≥ 8 s.
- Any absolute fix re-seeds `SensorFusionProvider`, so dead reckoning stays
  anchored across provider switches.

`NavigationService` no longer touches `navigator.geolocation` directly — it
subscribes to `LocationProviders.onLocationUpdate` and that's the entire
location pipeline. A small `LocationProviderChip` in the top-right overlay
shows the active source and lets you switch primary at runtime.

## Ask Maps grammar (cheat sheet)

| Intent                  | Example                              |
| ----------------------- | ------------------------------------ |
| Fly to a location       | `fly to London Eye` · `go to Zante`  |
| Orbit a POI             | `orbit Tower Bridge`                 |
| Stop camera motion      | `stop` · `end tour`                  |
| Cinematic tour          | `cinematic tour` · `tour Zante`      |
| Route to a POI          | `route to Big Ben`                   |
| Clear route             | `clear route`                        |
| Toggle 3D buildings     | `show 3D buildings` · `hide buildings` |
| Toggle terrain          | `show terrain` · `hide terrain`      |
| Pitch                   | `tilt 75` · `flat` · `cinematic`     |
| Zoom                    | `zoom in` · `zoom out` · `zoom 16`   |
| Mood                    | `day mode` · `dusk mode` · `night mode` |
| Reset                   | `reset` · `north up`                 |
| Help                    | `help`                               |

## Upgrading Ask Maps to an LLM

The parser is rule-based for determinism. To swap in an LLM, replace
`CommandParser.parse()` with a function-calling planner that returns the same
`{ command, match }` shape — the registry and execution path stay identical.
