// engine/3d/SpatialEngine.ts
//
// 3D — the spatial dimension. Ground truth for everything above it: roads,
// lanes, borough meshes, terrain, buildings. Owns the native road graph and
// emits geometry into the Zante scene via GpuHooks.

import type {
  IDimension,
  DimensionHost,
  DynamicContext,
  DimensionLayer
} from '../types';
import type { GpuHooks } from '../pipeline/GpuHooks';
import { type RoadGraph, type RoadSegment, buildRoadRibbon, defaultWidth } from './roads';
import { deriveLanes, type LaneSpec } from './lanes';
import { type Borough, continuityGroups } from './boroughMeshes';
import type { GeoCoord } from '../../core/zante/native/types';
import { NULL_HANDLE } from '../../core/zante/native/types';

export interface SpatialState {
  roadGraph: RoadGraph;
  boroughs: Borough[];
}

export interface SpatialPayload {
  /** Segments within the active streaming radius. */
  activeSegments: RoadSegment[];
  /** Lane specs for the segment the ego is currently on. */
  currentLanes: LaneSpec[];
  /** Borough the ego is in, if known. */
  currentBorough?: Borough;
}

/** Road surface material tone per atmospheric mode. */
const ROAD_TONE = {
  day: [0.18, 0.2, 0.24, 1] as const,
  dusk: [0.14, 0.12, 0.18, 1] as const,
  night: [0.08, 0.09, 0.12, 1] as const
};

export class SpatialEngine implements IDimension<SpatialPayload> {
  readonly id = '3d' as const;
  private host?: DimensionHost;
  private uploaded = new Set<string>();

  constructor(
    private state: SpatialState,
    private readonly gpu?: GpuHooks
  ) {}

  init(host: DimensionHost): void {
    this.host = host;
  }

  /** Replace the road/borough data (e.g. after streaming a new region). */
  setState(state: SpatialState): void {
    this.state = state;
    this.uploaded.clear();
  }

  getRoadGraph(): RoadGraph {
    return this.state.roadGraph;
  }

  continuity(): Map<string, Borough[]> {
    return continuityGroups(this.state.boroughs);
  }

  update(ctx: DynamicContext, _dt: number): DimensionLayer<SpatialPayload> {
    const origin = this.state.roadGraph.origin;
    const activeSegments = this.segmentsNear(ctx.ego.location, 1500);

    // Stream geometry for any newly-active segment exactly once.
    if (this.gpu) {
      const tone = ROAD_TONE[ctx.mode];
      for (const seg of activeSegments) {
        if (this.uploaded.has(seg.id)) continue;
        this.uploaded.add(seg.id);
        const mesh = buildRoadRibbon(seg, origin);
        this.gpu.placeMesh(
          mesh,
          { shader: NULL_HANDLE, baseColor: tone, roughness: 0.9, blend: 'opaque' },
          { layer: 1, tags: ['3d', 'road', seg.id] }
        );
      }
    }

    const current = activeSegments[0];
    const currentLanes = current ? deriveLanes(current) : [];
    const currentBorough = this.boroughAt(ctx.ego.location);

    return {
      dimension: this.id,
      payload: { activeSegments, currentLanes, currentBorough },
      scores: current
        ? [{ dimension: this.id, weight: 1, reason: `on ${current.roadClass} ${current.id}` }]
        : []
    };
  }

  dispose(): void {
    this.uploaded.clear();
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private segmentsNear(loc: GeoCoord, radiusM: number): RoadSegment[] {
    return this.state.roadGraph.segments
      .map((s) => ({ s, d: nearestVertexDistance(loc, s.centerline) }))
      .filter((x) => x.d <= radiusM)
      .sort((a, b) => a.d - b.d)
      .map((x) => x.s);
  }

  private boroughAt(loc: GeoCoord): Borough | undefined {
    return this.state.boroughs.find((b) => pointInRing(loc, b.boundary));
  }

  /** Convenience for callers that want a width without a segment lookup. */
  widthFor = defaultWidth;
}

function nearestVertexDistance(loc: GeoCoord, line: GeoCoord[]): number {
  let best = Infinity;
  for (const c of line) {
    const d = haversine(loc, c);
    if (d < best) best = d;
  }
  return best;
}

function haversine(a: GeoCoord, b: GeoCoord): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Ray-cast point-in-polygon on lat/lng. */
function pointInRing(p: GeoCoord, ring: GeoCoord[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lng, yi = ring[i].lat;
    const xj = ring[j].lng, yj = ring[j].lat;
    const intersect =
      yi > p.lat !== yj > p.lat &&
      p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
