# DevShell

DevShell is Smart Maps' **simulated runtime for Windows and any other
non-native host**. It exists so the web/desktop build can boot and run the full
A/E engine with no GNSS, no IMU, and no native core underneath it.

The iOS and Android native builds never touch this module.

## How it engages

`isNativeCoreAvailable()` (`devshell/src/env.ts`) is the single check:

| Host | Result | What runs |
|---|---|---|
| iOS / Android native app | `true` | real CoreLocation / CoreMotion adapters |
| Native host embedding SM (injects `window.__SM_NATIVE_CORE__`) | `true` | the host's native core |
| Windows / macOS / Linux desktop browser | **`false`** | **DevShell simulated providers** |
| Mobile browser (no native core) | **`false`** | **DevShell simulated providers** |
| Headless / SSR / CI | **`false`** | **DevShell simulated providers** |

Force it either way for testing with `window.__SM_FORCE_DEVSHELL__ = true`.

When the check is false, `SmartMapsEngine` registers
`SimulatedLocationProvider` as the **primary** location provider and starts
`DevShellRuntime`, which replaces every hardware feed:

```
simulated GNSS → LocationProviders   (map centre, provider chip, NavigationService)
simulated GNSS → SMCore.pushGnss     (position, dead reckoning, Always-IN)
simulated IMU  → SMCore.pushImu      (motion state + confidence)
simulated pose → SmartMapsAE.setEgo  (Dynamic Engine 3D…7D pipeline)
```

## Boot resolves immediately

`SimulatedLocationProvider.start()` publishes its first fix **synchronously**,
and `DevShellRuntime.start()` runs one engine tick before it returns. So a
location, an Always-IN state and an ego pose all exist before boot finishes —
nothing waits on a lock that would never arrive, and the 8 s boot deadline in
`index.html` is never reached for want of a fix.

Measured on a simulated Windows host: `start()` returns in **~3 ms** with a fix
already cached.

## Emitted telemetry

`DevShellSample` mirrors the native providers field for field, so no consumer
needs a DevShell-specific code path:

| Field | Example |
|---|---|
| `position` | `{ lat: 51.50515, lng: -0.13141 }` |
| `accuracyM` | `6.46` |
| `motionState` | `still` / `walking` / `driving` / `unknown` |
| `confidence` | `0.715` |
| `headingDeg` | `89.99` |
| `speedMps` | `12` |
| `updateRateHz` | `10` |

A matching IMU stream (`accelMagnitude`, `gyroMagnitude`) accompanies it, so
dead reckoning and motion confidence behave as they do on hardware.

## Simulation modes (`DevShellConfig`)

`DevShellConfig` lives in `devshell/sim/config.ts` and is re-exported from
`devshell/src/env.ts`, so the environment check and the mode selection come
from one place. Resolution order: explicit argument → `window.__SM_DEVSHELL_CONFIG__`
→ `?devshell=<mode>` in the URL → the default.

| Mode | What it does |
|---|---|
| `looped` *(default)* | The drive loop DevShell shipped with. Always-IN is driven by the **live engine**. |
| `path` | Plays back a scripted journey — GNSS path, motion sequence, and an optional Always-IN timeline. Deterministic. |
| `static` | A fixed pose that never moves, for UI debugging. Always-IN pinned to `OFF`. |
| `chaotic` | Randomised (but seeded) noise, lurching speed, heading wander and GNSS dropouts — stresses smoothing, snapping and camera code. |

```js
// Before the app boots:
window.__SM_DEVSHELL_CONFIG__ = { mode: 'path' };
// or just open  index.html?devshell=chaotic
```

Journeys live in `devshell/sim/journeys/`. Copy `sampleJourney.ts` to add one:

```ts
export const MY_JOURNEY: JourneyScript = {
  id: 'my-run', name: 'My run', speedMps: 11,
  path: [{ lat, lng, accuracyM, headingDeg, speedMps, holdSeconds }, ...],
  motionSequence: [{ state: 'driving', seconds: 12 }, ...],
  inTimeline:     [{ state: 'PREP', seconds: 6 }, ...]
};
```

## A note on `HOLD`

The shared Always-IN engine has four states: `OFF | PREP | ACTIVE | EXIT`.
DevShell reports a **superset** that adds `HOLD`. The engine is deliberately
*not* being given a fifth state — that would change live product behaviour on
every platform, not just DevShell. Instead:

* scripted journeys may name `HOLD` directly in their `inTimeline`;
* otherwise DevShell derives it — `ACTIVE` plus a sustained stop (≥2.5 s) is a
  hold at a junction.

`status().engineINState` always carries the raw four-state engine value, so
consumers that only understand those can use it unchanged.

## The simulation

A vehicle drives a closed loop around the boot origin, cycling
cruise → slowing → stopped → accelerating, so motion state, speed, heading and
accuracy all change realistically. Noise is **seeded, not random**, so a
DevShell session replays identically.

The default loop is a tight ~250 m circuit, which puts a junction inside the
Always-IN approach envelope every ~25–30 s — the full `OFF → PREP → ACTIVE`
cycle is observable within seconds of boot. Pass `route` or `speedMps` in
`DevShellOptions` for longer-run testing.

Verified headlessly on a simulated Windows host: environment detected as
`browser-desktop` / `nativeCore = false`, fix available synchronously,
all six required fields present, position advancing, and Always-IN reaching
`ACTIVE` at ~26 s.
