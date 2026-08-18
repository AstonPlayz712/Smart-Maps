# Smart Maps A/E — Stage 1 (Native Foundation)

This is the Stage-1 expansion of the **Z Build** into the full **Advanced/Elite
(A/E)** Smart Maps system inside AutoOS. Stage 1 delivers the native core,
module structure, dimensional engine, immersive-navigation world, external-engine
integration rule, and volumetric widget foundations — all scaffolded with stable
interfaces and runnable reference logic, ready for Stage 2 (UI/UX).

> **Charter:** native everything · Zante renderer is the foundation · Dynamic
> Engine is the core · A/E everything · no hybrid layers, no WebView, no Appflow.

## Top-level module map

```
core/zante/native/     ← promoted Z Build → native core (Zante renderer)
  gpu/                   IGpuDevice · ZanteGpuPipeline (Vulkan/Metal/WebGPU)
  renderer/              IRenderer · ZanteRenderer
  scene/                 ISceneGraph · SceneGraph · SceneNode
  assets/                IAssetStream · AssetLoader (streamed, budgeted)
  threading/             ThreadPool (native priority lanes)
  audio/                 IAudioEngine (native spatial mixer + voice bus)
  widgets/               IWidgetHost · WidgetHost (volumetric)
  interop/               external geometry → native mesh → GPU
  ZanteNativeCore.ts     facade wiring all of the above

engine/                ← Dynamic Engine (the core)
  3d/                    Spatial: roads, lanes, borough meshes, terrain, buildings
  4d/                    Temporal: traffic, weather, rush hour, delays
  5d/                    Context: familiarity, trip type, stress, urgency
  6d/                    Behaviour: habits, avoidance, preferences
  7d/                    Intent: purpose, emotional weight, destination intent
  pipeline/              Pipeline (fusion) · GpuHooks · ThreadModel
  external/              50% rule: FeatureCoverage · ExternalEngineRegistry · adapters
  widgets/volumetric/    Weather Orb · Calendar Ring · Nav Ribbon · Flight · Reminders
  DynamicEngine.ts       orchestrator

automaps/in/           ← AutoMaps IN (Immersive Navigation, A/E)
  meshes.ts              corridors · roundabout discs · volumetric junctions
  boroughContinuity.ts   seamless corridors across borough seams
  lighting.ts            dynamic lighting · occlusion · camera transitions
  sonicTiming.ts         Sonic voice-timing hooks
  AutoMapsIN.ts          orchestrator

src/integration/SmartMapsAE.ts  ← binds the A/E stack into the existing app
```

## Native pipelines

1. **Render pipeline.** `DynamicContext → DynamicEngine.tick → dimensional geometry
   → GpuHooks → AssetConverter → IGpuDevice → ZanteRenderer.renderFrame`. Nothing
   above the GPU device touches a graphics API.
2. **Asset streaming pipeline.** `AssetKey → AssetLoader (ThreadPool) → interop
   decode → native mesh → GPU upload → SceneGraph`, residency-budgeted with LRU
   eviction.
3. **Dimensional pipeline.** `Pipeline.run` drives 3D→7D in order, each returns a
   typed `DimensionLayer`; fusion blends per-dimension routing scores into
   `DimensionalFrame.blended`.
4. **External-engine pipeline.** `evaluateCoverage` → integrate-whole (≥50%) or
   extract-goods (<50%) → `GeometryAdapter` → native mesh → GPU.
5. **Immersive pipeline.** Route polyline → corridor/lane/junction meshes →
   lighting + camera phase machine → Sonic cues on the native audio transport.

## Integration points

| Boundary | Hook |
|----------|------|
| App ⇄ A/E | `src/integration/SmartMapsAE.ts`, booted from `SmartMapsEngine.attach` (guarded, additive) |
| Dynamic Engine ⇄ Zante | `engine/pipeline/GpuHooks` over `ZanteNativeCore.{gpu,scene,converter}` |
| Dimensions ⇄ threads | `engine/pipeline/ThreadModel` over `core/.../threading/ThreadPool` |
| External geometry ⇄ renderer | `core/.../interop/{GeometryAdapter,AssetConverter,NativeFormat}` |
| Voice ⇄ visuals | `automaps/in/sonicTiming` over `core/.../audio/IAudioEngine` |
| Signals ⇄ app bus | `DynamicEngine.onSignal` → `EventBus<EngineEvents>` |

## Dimensional logic (summary)

- **3D** is ground truth (geometry); lower dimensions decide, higher dimensions nudge.
- **4D** blends live traffic with a rush-hour prior and hard delay overrides into a per-segment time cost.
- **5D** turns familiarity/stress/urgency into routing + guidance-verbosity bias.
- **6D** learns per-driver habits/avoidance (EMA, background lane) + standing preferences.
- **7D** maps purpose/emotion/intent to presentation tone + a gentle routing bias.

Fusion weights (`engine/pipeline/Pipeline.ts`): 3D 1.0 · 4D 0.9 · 5D 0.6 · 6D 0.5 · 7D 0.4.

## Hybrid removal

See `core/zante/native/NATIVE_MIGRATION.md`. Stage 1 removes the Appflow descriptor
(`ionic.config.json`) and repoints the Capacitor sync scripts; the WebView / JS-
bridge / sandboxed-render surfaces are mapped to their native replacements and
scheduled for decommission the moment the native shell renders on device.

## Status & verification

- `npm run typecheck` (project-pinned TS 5.6) — clean.
- `npm run build` (vite) — clean; A/E stack reachable from the app entry.
- Reference implementations run headless so every interface is exercised today;
  native GPU/audio bodies and live data feeds land in Stage 2+ behind these
  exact surfaces.
