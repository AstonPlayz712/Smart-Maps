/**
 * sm-core/renderer — Renderer v2.
 *
 * SM's own map renderer. It replaced the Apple/MapLibre pipeline entirely: it
 * owns the layer stack, the camera and the active floor, and draws through a
 * pluggable `RenderBackend` so identical renderer logic runs on every platform
 * — Canvas2D in the browser, the native backend on iOS, Zante on Android.
 *
 * Two rules are enforced here rather than left to callers:
 *
 *   • **Internal layers are opt-in.** `debugMode` defaults to false, and with
 *     it false the frame contains no internal geometry at all — not hidden,
 *     absent. Nothing internal can reach a shipped UI by omission.
 *   • **Indoor features are clipped to the active floor**, by one predicate
 *     owned by `IndoorLayer`, so no layer can forget to apply it.
 */

export {
  MapRenderer,
  DEFAULT_RENDERER_CONFIG,
  type Camera,
  type RendererConfig,
  type RenderFrame,
  type RenderBackend,
  type MapRendererOptions
} from './MapRenderer';
export {
  IndoorLayer,
  type IndoorLayerState,
  type FloorChange,
  type IndoorListener
} from './IndoorLayer';
export { Canvas2DBackend, type Canvas2DTheme } from './backends/Canvas2DBackend';
export {
  resolveAccuracyRing,
  metresPerPixel,
  metresToPixels,
  MAX_ACCURACY_RADIUS_PX,
  type AccuracyRing
} from './layers/AccuracyLayer';
export {
  InternalDebugLayer,
  type InternalDebugFrame,
  type InternalDebugInput
} from './layers/InternalDebugLayer';
