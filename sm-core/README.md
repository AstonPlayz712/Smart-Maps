# sm-core — the Smart-Maps Dynamic Spatial Engine

Smart-Maps is **not an operating system**. It is a cross-platform Dynamic
Spatial Engine (DSE) that runs as a web app and as a mobile app, from one
shared TypeScript core.

There is **no bootloader, no kernel, and no boot phase**. `init()` wires the
modules together and resolves; from that moment every call is answerable.
Data that has not arrived yet — an unloaded tile, a fix that has not landed —
is just missing data, and the engine keeps running around it. There is no state
in which the engine "hasn't finished starting".

## The API

Three calls, identical on every platform:

```ts
import { DSE } from 'sm-core';

const dse = new DSE({ surface });
await dse.init();                     // Promise<void>, resolves immediately
dse.updatePosition(gnssSample, imu);  // void
dse.renderFrame();                    // void
```

`sm-platform-web/main.ts` and `sm-platform-mobile/App.tsx` make exactly those
calls with exactly those sample shapes, so the two shells produce the same
state from the same trace — asserted by `scripts/dse-smoke.mjs`.

The only shapes a host has to know are `GnssSample`, `ImuSample` and
`RenderSurface`, all in [`types.ts`](./types.ts). The engine touches no DOM, no
`window` and no native API; the host supplies samples and a draw surface.

## Modules

Each is importable on its own.

| Import | What it owns |
| --- | --- |
| `sm-core/ae` | **A/E Dynamic** — GNSS/IMU fusion, altitude and floor resolution, motion-mode inference, confidence, trajectory prediction, ego pose, Always-IN (horizontal corridor state machine + vertical phase) |
| `sm-core/ai` | **Smart-AI** — POI relevance, indoor/outdoor inference, floor-transition detection, route correction, environment reactivity |
| `sm-core/dimensions` | **3–7D engine** — geometry, motion, environment, traffic, satellite, and an honest `depth` for how far the stack actually reaches right now |
| `sm-core/tiles` | **SM-VT v2** — SM's own vector tile pipeline: four families, tile-local integer geometry, LRU cache, request coalescing, overzoom |
| `sm-core/renderer` | **Renderer v2** — SM's own map renderer and its pluggable backends |
| `sm-core/routing` | Indoor and multi-floor routing: A\* over travel time with vertical connectors as real graph edges |

```
sm-core/
├── DSE.ts            the engine — composes the five modules
├── types.ts          GnssSample, ImuSample, RenderSurface, DseState
├── ae/               A/E Dynamic (dynamic/ holds the corridor engine)
├── ai/               Smart-AI
├── dimensions/       3–7D
├── tiles/            SM-VT v2
├── renderer/         Renderer v2 (backends/, layers/)
└── routing/          indoor + multi-floor A*
```

## Two rules the engine enforces for you

**Internal layers are opt-in.** `debugMode` defaults to `false`, and with it
false a frame contains no internal geometry *at all* — absent, not hidden.
Nothing internal can reach a shipped UI by omission.

**A coarse fix is a real fix.** Accuracy grades a fix; it never gates one.
Discarding coarse fixes is what used to leave the engine with no position on a
cold or indoor start.

## Adding to a module

Every submodule is a plain class with an `init`/`update` shape and no
dependency on the renderer or the host, so any of them can be deepened — or
swapped for a learned model — without a consumer changing. The Smart-AI models
in particular ship deterministic, explainable baselines meant to be replaced.
