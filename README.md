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
│   └── NavigationService.ts    ← THE NAVIGATION KERNEL (state + subscribers)
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
│   └── autolink/               ← COMPANION-DEVICE BRIDGE
│       └── AutoLinkBridge.ts   (subscribes via 'autolink' channel)
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
`ImmersiveNavigation` directly. `AutoLinkBridge` subscribes to all three streams
on the `autolink` channel and currently logs to the console — replace its
handlers with a transport adapter to push state to a companion device.

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
