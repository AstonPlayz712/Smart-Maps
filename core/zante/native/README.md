# Zante Native Core (`core/zante/native/`)

The **Z Build, promoted to the native A/E foundation.** Everything that used to
be entangled with MapLibre + the WebView render thread now lives here as a clean,
backend-agnostic native core. The Dynamic Engine, AutoMaps IN, and the volumetric
widget layer all stand on this.

## Subsystems

| Path | Role | Key interface |
|------|------|---------------|
| `gpu/` | Native GPU device (Vulkan / Metal / WebGPU) | `IGpuDevice` → `ZanteGpuPipeline` |
| `renderer/` | Scene-walking native renderer | `IRenderer` → `ZanteRenderer` |
| `scene/` | Scene graph + nodes | `ISceneGraph` → `SceneGraph` |
| `assets/` | Streaming asset loader (residency-budgeted) | `IAssetStream` → `AssetLoader` |
| `threading/` | Native priority thread pool | `ThreadPool` |
| `audio/` | Native spatial mixer + voice bus | `IAudioEngine` |
| `widgets/` | Volumetric widget host | `IWidgetHost` → `WidgetHost` |
| `interop/` | External geometry → native mesh → GPU | `GeometryAdapterRegistry`, `AssetConverter`, `NativeFormat` |

## Dependency direction

```
ZanteNativeCore (facade)
  ├─ ThreadPool ◄── AssetLoader
  ├─ ZanteGpuPipeline (IGpuDevice)
  │     ▲
  │     └─ ZanteRenderer (IRenderer) ── walks ──► SceneGraph (ISceneGraph)
  │                                                   ▲
  │                                                   └─ WidgetHost, AssetConverter
  └─ GeometryAdapterRegistry ──► NativeFormat ──► AssetConverter ──► GPU + Scene
```

Nothing above the GPU device touches a graphics API. Backends are swapped by
changing one constructor argument in `ZanteNativeCore`.

## Booting

```ts
import { ZanteNativeCore } from 'core/zante/native';

const core = new ZanteNativeCore({
  viewport: { x: 0, y: 0, width, height, devicePixelRatio },
  backend: 'vulkan',          // 'metal' | 'webgpu'
  mode: 'day'
});
core.start();
// per RAF / vsync:
core.frame(dtSeconds);
```

## Status

Stage 1 = **scaffolding + stable interfaces**. The reference implementations
(`ZanteGpuPipeline`, `SceneGraph`, `AssetLoader`) run headless so call sites are
exercised today; the native bodies land behind the same interfaces in
`devshell/native/core/renderer.cpp` during Stage 2+.
