/**
 * AccuracyLayer — the position accuracy indicator.
 *
 * Computes the accuracy ring in *screen pixels*, which is the whole point:
 * accuracy arrives in metres and the renderer draws in pixels, so the
 * conversion has to happen against the live zoom and latitude. Skipping it is
 * what produced the giant blue disc swallowing the map.
 */

import type { SMPosition } from '../../telemetry/Position';

/** Equator metres per pixel at zoom 0 for 256 px tiles. */
const METRES_PER_PIXEL_Z0 = 156543.03392;

/**
 * Hard ceiling for the ring, pixels. A 500 m fix is genuinely uncertain, but
 * drawing a 900 px circle communicates nothing and hides the map — past this
 * size the ring is capped and marked `clamped` so the UI can caption it.
 */
export const MAX_ACCURACY_RADIUS_PX = 80;
/** Floor, so a very precise fix still renders as a visible dot. */
const MIN_ACCURACY_RADIUS_PX = 6;

export type AccuracyKind = 'horizontal' | 'vertical';

export interface AccuracyRing {
  /** Radius to draw, pixels. Already clamped. */
  radiusPx: number;
  /** True when the true radius exceeded the cap. */
  clamped: boolean;
  /** Which accuracy this represents — indoors it is the vertical one. */
  kind: AccuracyKind;
  /** The underlying accuracy in metres, for captions. */
  accuracyM: number;
  /** False when no ring should be drawn at all. */
  visible: boolean;
}

/**
 * Ground resolution at a given latitude and zoom, metres per pixel.
 * Mercator compresses toward the poles, so latitude matters — using the
 * equator value everywhere over-sized the ring by ~40% in London.
 */
export function metresPerPixel(latitude: number, zoom: number): number {
  const latRad = (latitude * Math.PI) / 180;
  return (METRES_PER_PIXEL_Z0 * Math.cos(latRad)) / Math.pow(2, zoom);
}

/** Metres → screen pixels at the current camera. */
export function metresToPixels(metres: number, latitude: number, zoom: number): number {
  const mpp = metresPerPixel(latitude, zoom);
  if (!Number.isFinite(mpp) || mpp <= 0) return 0;
  return metres / mpp;
}

/**
 * Resolve the accuracy ring for a position.
 *
 * Indoors (`floorLevel !== null`) the horizontal GNSS ring is suppressed
 * entirely: satellite accuracy is meaningless under a roof and the huge ring
 * it implies is pure noise on a floor plan. The vertical accuracy is shown
 * instead, which is the number that actually matters indoors — how sure we are
 * about which floor you are on.
 */
export function resolveAccuracyRing(
  position: SMPosition,
  zoom: number
): AccuracyRing {
  const indoors = position.floorLevel !== null;
  const accuracyM = indoors ? position.verticalAccuracyM : position.accuracyM;

  if (!Number.isFinite(accuracyM) || accuracyM <= 0) {
    return { radiusPx: 0, clamped: false, kind: indoors ? 'vertical' : 'horizontal', accuracyM: 0, visible: false };
  }

  const raw = metresToPixels(accuracyM, position.lat, zoom);
  const clamped = raw > MAX_ACCURACY_RADIUS_PX;
  const radiusPx = Math.max(
    MIN_ACCURACY_RADIUS_PX,
    Math.min(MAX_ACCURACY_RADIUS_PX, raw)
  );

  return {
    radiusPx: Number(radiusPx.toFixed(2)),
    clamped,
    kind: indoors ? 'vertical' : 'horizontal',
    accuracyM,
    visible: true
  };
}
