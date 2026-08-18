# Hybrid-Layer Removal — Native Migration Map

Stage 1 directive: **native everything. No hybrid layers, no WebView, no Appflow,
no JS bridges, no sandboxed rendering.** This document records what is being
decommissioned and the native subsystem that replaces it. It is the source of
truth for the decommission sequence so nothing is ripped out before its native
replacement is load-bearing.

## Removed in this stage

| Hybrid artifact | Status | Native replacement |
|-----------------|--------|--------------------|
| `ionic.config.json` (Appflow/Capacitor integration descriptor) | **removed** | Native build pipeline (`devshell/`, GitHub Actions Android/iOS) |
| `package.json` Appflow `capacitor:sync*` echo scripts | **repointed** to native no-ops | Native asset sync handled in-engine |

## Mapped for decommission (sequenced — kept until native path is load-bearing)

| Hybrid layer | Replaced by |
|--------------|-------------|
| WebView DOM rendering | `core/zante/native/renderer` (`ZanteRenderer` + `IGpuDevice`) |
| MapLibre WebGL context | `ZanteGpuPipeline` (Vulkan / Metal / WebGPU) walking `SceneGraph` |
| Browser `<audio>` + Web Speech TTS | `core/zante/native/audio` (`IAudioEngine`, native voice bus) |
| JS ⇄ native Capacitor bridge | Direct native core API (`ZanteNativeCore`), no serialization bridge |
| WebView main-thread work | `core/zante/native/threading` (`ThreadPool`) |
| Sandboxed/iframe widget rendering (DOM) | `core/zante/native/widgets` (`WidgetHost`, volumetric, GPU-drawn) |
| Web-bundled assets | `core/zante/native/assets` (`AssetLoader`, streamed, residency-budgeted) |

## Why phased, not a single delete

The Capacitor Android/iOS projects (`android/`, `ios/`) and the `@capacitor/*`
dependencies remain on disk **only** as the current shippable shell until the
native `ZanteNativeCore` surface boots a window on device (Stage 2). They are
flagged here, carry no new code, and are scheduled for removal the moment the
native shell renders a frame on hardware. No new hybrid surface may be added.

## Rule going forward

Any new rendering, audio, threading, or asset-streaming code **must** route
through `core/zante/native`. Adding a WebView, a JS bridge, or an Appflow hook is
a regression against the A/E charter.
