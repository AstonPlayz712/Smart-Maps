# Dynamic Engine (`engine/`)

The **core of Smart Maps A/E.** A stack of five live dimensions above the static
2D base, each a `IDimension` that reads one shared `DynamicContext` per tick and
contributes a typed layer + routing scores. The engine fuses those layers into a
single navigation decision and pushes dimensional geometry into the Zante native
renderer.

## Dimensions

| Dir | Dimension | Models | Output |
|-----|-----------|--------|--------|
| `3d/` | **Spatial** | roads, lanes, borough meshes, terrain, buildings | native geometry + "where am I" |
| `4d/` | **Temporal** | traffic, weather, rush hour, delays | per-segment time cost |
| `5d/` | **Context** | familiarity, trip type, stress, urgency | guidance bias |
| `6d/` | **Behaviour** | habits, avoidance, preferences | personal routing bias |
| `7d/` | **Intent** | purpose, emotional weight, destination intent | tone + gentle bias |

Lower dimensions decide (geometry is ground truth); higher dimensions nudge. Fusion
weights live in `pipeline/Pipeline.ts`.

## Pipeline

```
DynamicContext ──► Pipeline.run()
                     ├─ 3D SpatialEngine   ─┐
                     ├─ 4D TemporalEngine   │
                     ├─ 5D ContextEngine    ├─► fuse(weights) ─► DimensionalFrame.blended
                     ├─ 6D BehaviourEngine  │
                     └─ 7D IntentEngine    ─┘
```

- `pipeline/GpuHooks.ts` — the only path dimensions use to push geometry to the GPU.
- `pipeline/ThreadModel.ts` — lanes (Frame / Interactive / Streaming / Background) over the native `ThreadPool`.

## External engines (50% rule)

`external/` evaluates any third-party engine with `evaluateCoverage`:

- **≥ 50%** of required native features (`gpu, renderer, geometry, terrain, streaming`) → `integrate-whole`.
- **< 50%** → extract only the goods (meshes, terrain, road graphs, shaders) via `adapters/` and fuse them into the native engine through the Zante interop layer.

## Driving it

```ts
import { DynamicEngine } from 'engine';

const dyn = new DynamicEngine({ core, spatial, onSignal: bus.emitRaw });
dyn.setEgo({ location, headingDeg, speedMps });
const frame = dyn.tick(dt);     // fused dimensional decision
```

## Status

Stage 1 = scaffolding + stable interfaces with runnable reference logic. Live data
feeds (traffic/weather), learned models (familiarity/habits), and the native GPU
bodies arrive in later stages behind these exact surfaces.
