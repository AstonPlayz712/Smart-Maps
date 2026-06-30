# AutoMaps IN (`automaps/in/`)

**Immersive Navigation, A/E.** Turns the route into a volumetric world the driver
moves *through*, rendered entirely through the Zante native core.

## What it builds

| Piece | File | Form |
|-------|------|------|
| Corridor | `meshes.buildCorridorMesh` | U-section tube along the route centreline |
| Lane rails | `engine/3d/lanes.buildLaneRail` | glowing guide on the active lane |
| Roundabout disc | `meshes.buildRoundaboutDisc` | flat ring with lit active exit |
| Volumetric junction | `meshes.buildJunctionVolume` | glow volume over a junction footprint |

## Presentation

- **Borough continuity** (`boroughContinuity.ts`) — corridors stay seamless across borough seams that share a `continuityId`.
- **Dynamic lighting + occlusion** (`lighting.ts`) — key/ambient/highlight rig that brightens junctions on approach; tall close geometry fades so it never blocks the road ahead.
- **Camera transitions** (`lighting.ts`) — eased `free → enter → follow → junction → exit` phase machine, no overshoot.
- **Sonic voice timing** (`sonicTiming.ts`) — schedules voice lines against the native audio transport so each instruction resolves exactly as its visual moment peaks.

## Driving it

```ts
import { AutoMapsIN } from 'automaps/in';

const inav = new AutoMapsIN({ gpu: dyn.gpuHooks, boroughs, origin, audio: core.audio });
inav.enter(routePath, lanes);          // builds the corridor + rails
inav.update(dt, junctionProximity, boroughId);  // per frame
inav.exit();
```

Consumes the Dynamic Engine's 3D spatial geometry + 4D/5D context; emits only
native scene nodes. No DOM, no WebView.
