/**
 * Route correction.
 *
 * Watches the live position against the active route and decides whether the
 * subject has genuinely left it. "Genuinely" is the whole job: a single fix
 * 40 m off a path is usually a bad fix, not a wrong turn, so deviation must be
 * both large relative to the fix accuracy *and* sustained before a reroute is
 * proposed.
 *
 * This proposes; it never reroutes on its own. The caller owns that decision,
 * which is why the result is a suggestion with a reason attached.
 */

import type { LngLatPoint } from '../types';
import type { SMPosition } from '../ae/Position';
import { groundDistanceM } from './PoiRelevance';

export interface RouteCorrectionState {
  /** Distance to the nearest point on the route, metres. Null with no route. */
  deviationM: number | null;
  /** True once deviation has been sustained past the tolerance. */
  offRoute: boolean;
  /** Why the current verdict holds — surfaced for diagnostics, not for the UI. */
  reason: string;
  /** True when the caller should ask the router for a new route. */
  shouldReroute: boolean;
}

/** Deviation must persist this long before it counts as leaving the route. */
const SUSTAIN_MS = 4000;
/** Floor under the accuracy-scaled tolerance, metres. */
const BASE_TOLERANCE_M = 20;

export class RouteCorrectionModel {
  private offRoute = false;
  private deviatingMs = 0;

  reset(): void {
    this.offRoute = false;
    this.deviatingMs = 0;
  }

  /**
   * `routePath` is the active route as a polyline. Pass an empty array when no
   * route is active — the model then reports "no route" rather than guessing.
   */
  update(position: SMPosition, routePath: LngLatPoint[], dtMs: number): RouteCorrectionState {
    if (routePath.length < 2) {
      this.reset();
      return { deviationM: null, offRoute: false, reason: 'no active route', shouldReroute: false };
    }

    const deviationM = nearestDistanceM(position, routePath);
    // A coarse fix earns a wider corridor: the tolerance tracks the honest
    // uncertainty of the measurement instead of a fixed guess.
    const tolerance = BASE_TOLERANCE_M + (Number.isFinite(position.accuracyM) ? position.accuracyM : 0);

    if (deviationM > tolerance) {
      this.deviatingMs += dtMs;
    } else {
      this.deviatingMs = 0;
      if (this.offRoute) {
        this.offRoute = false;
        return { deviationM, offRoute: false, reason: 'back within tolerance', shouldReroute: false };
      }
    }

    const wasOff = this.offRoute;
    this.offRoute = this.deviatingMs >= SUSTAIN_MS;

    return {
      deviationM,
      offRoute: this.offRoute,
      reason: this.offRoute
        ? `${deviationM.toFixed(0)} m off for ${(this.deviatingMs / 1000).toFixed(1)} s (tolerance ${tolerance.toFixed(0)} m)`
        : `within ${tolerance.toFixed(0)} m tolerance`,
      // Fires once on the transition, not every tick, so the caller cannot be
      // stuck in a reroute loop while the deviation persists.
      shouldReroute: this.offRoute && !wasOff
    };
  }
}

function nearestDistanceM(position: SMPosition, path: LngLatPoint[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < path.length - 1; i++) {
    const d = distanceToSegmentM(position, path[i], path[i + 1]);
    if (d < best) best = d;
  }
  return best;
}

function distanceToSegmentM(p: { lat: number; lng: number }, a: LngLatPoint, b: LngLatPoint): number {
  // Work in a local metric frame anchored at the segment start — over a single
  // route segment the flat-earth error is far below the fix accuracy.
  const latScale = 111_320;
  const lngScale = 111_320 * Math.cos((a.lat * Math.PI) / 180);
  const ax = 0;
  const ay = 0;
  const bx = (b.lng - a.lng) * lngScale;
  const by = (b.lat - a.lat) * latScale;
  const px = (p.lng - a.lng) * lngScale;
  const py = (p.lat - a.lat) * latScale;

  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return groundDistanceM(p, a);

  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSq));
  return Math.hypot(px - dx * t, py - dy * t);
}
