// src/logic/RouteManager.ts
//
// Builds and queries the corridor: the ordered ribbon of segments + junctions
// the whole logic layer navigates against. Positions are addressed by
// chainage (metres along the corridor from its start), which turns 2-D
// map-matching into cheap 1-D arithmetic for DR, prediction and IN.

import type {
  CorridorJunction,
  CorridorProjection,
  CorridorSegment,
  JunctionNode,
  Position
} from './types';

const EARTH_R = 6371000;
const DEFAULT_HALF_WIDTH_M = 12;

// ─── geo helpers (exported for the rest of the logic layer) ─────────────────

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function haversineM(a: Position, b: Position): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDeg(a: Position, b: Position): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Wrap so interpolation takes the short way around 0/360. */
export function shortestAngleDeltaDeg(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

// ─── internal corridor representation ────────────────────────────────────────

interface Vertex {
  position: Position;
  chainageM: number;
  /** Local equirectangular coords (metres) relative to the corridor origin. */
  x: number;
  y: number;
}

interface SegmentRange {
  segment: CorridorSegment;
  startChainageM: number;
  endChainageM: number;
}

export class RouteManager {
  private vertices: Vertex[] = [];
  private ranges: SegmentRange[] = [];
  private junctions: CorridorJunction[] = [];
  private origin: Position | null = null;
  private cosLat = 1;
  private lengthM = 0;
  /** Projection search hint — index of the polyline edge last matched. */
  private hintIndex = 0;

  // ─── build ────────────────────────────────────────────────────────────────

  /**
   * Build the corridor from ordered segments and junction nodes. Segment
   * paths are concatenated (consecutive duplicate points collapsed); each
   * junction is projected onto the corridor to get its chainage.
   */
  build(segments: CorridorSegment[], junctionNodes: JunctionNode[]): void {
    this.clear();
    if (segments.length === 0 || segments.every((s) => s.path.length < 2)) return;

    this.origin = segments[0].path[0];
    this.cosLat = Math.cos(toRad(this.origin.lat));

    let chainage = 0;
    for (const segment of segments) {
      if (segment.path.length < 2) continue;
      const start = chainage;
      for (const p of segment.path) {
        const prev = this.vertices[this.vertices.length - 1];
        if (prev) {
          const step = haversineM(prev.position, p);
          if (step < 0.01) continue; // collapse duplicates at segment joins
          chainage += step;
        }
        const { x, y } = this.toLocal(p);
        this.vertices.push({ position: p, chainageM: chainage, x, y });
      }
      this.ranges.push({ segment, startChainageM: start, endChainageM: chainage });
    }
    this.lengthM = chainage;

    this.junctions = junctionNodes
      .map((node) => {
        const proj = this.projectToCorridor(node.position);
        return proj ? { node, chainageM: proj.chainageM } : null;
      })
      .filter((j): j is CorridorJunction => j !== null)
      .sort((a, b) => a.chainageM - b.chainageM);
  }

  clear(): void {
    this.vertices = [];
    this.ranges = [];
    this.junctions = [];
    this.origin = null;
    this.lengthM = 0;
    this.hintIndex = 0;
  }

  hasRoute(): boolean {
    return this.vertices.length >= 2;
  }

  totalLengthM(): number {
    return this.lengthM;
  }

  allJunctions(): CorridorJunction[] {
    return this.junctions.slice();
  }

  /** The corridor's terminal node: last 'terminal' junction, else null. */
  terminalNode(): CorridorJunction | null {
    for (let i = this.junctions.length - 1; i >= 0; i--) {
      if (this.junctions[i].node.kind === 'terminal') return this.junctions[i];
    }
    return null;
  }

  // ─── projection ───────────────────────────────────────────────────────────

  /**
   * Snap a raw position onto the corridor centreline. Searches a window
   * around the last matched edge first (O(1) for the common tracking case)
   * and falls back to a full scan when the window miss is large.
   */
  projectToCorridor(p: Position): CorridorProjection | null {
    if (!this.hasRoute()) return null;
    const local = this.toLocal(p);

    const windowed = this.scanEdges(local, Math.max(0, this.hintIndex - 12), Math.min(this.vertices.length - 1, this.hintIndex + 12));
    // Accept the windowed match when it's plausibly on-corridor; otherwise a
    // full scan handles teleports (re-routes, first fix, GPS jumps).
    const best =
      windowed && Math.abs(windowed.lateralOffsetM) < 150
        ? windowed
        : this.scanEdges(local, 0, this.vertices.length - 1) ?? windowed;
    if (!best) return null;

    this.hintIndex = best.edgeIndex;
    return {
      chainageM: best.chainageM,
      lateralOffsetM: best.lateralOffsetM,
      point: best.point,
      headingDeg: best.headingDeg,
      segmentId: this.segmentAtChainage(best.chainageM)?.id ?? this.ranges[0].segment.id
    };
  }

  private scanEdges(
    local: { x: number; y: number },
    from: number,
    to: number
  ): (CorridorProjection & { edgeIndex: number }) | null {
    let best: (CorridorProjection & { edgeIndex: number }) | null = null;
    let bestAbs = Infinity;

    for (let i = from; i < to; i++) {
      const a = this.vertices[i];
      const b = this.vertices[i + 1];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const lenSq = ex * ex + ey * ey;
      if (lenSq === 0) continue;
      let t = ((local.x - a.x) * ex + (local.y - a.y) * ey) / lenSq;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = a.x + ex * t;
      const py = a.y + ey * t;
      const dx = local.x - px;
      const dy = local.y - py;
      const dist = Math.hypot(dx, dy);
      if (dist < bestAbs) {
        bestAbs = dist;
        // Sign of the lateral offset: positive = right of travel direction.
        const cross = ex * dy - ey * dx;
        const edgeLen = Math.sqrt(lenSq);
        best = {
          edgeIndex: i,
          chainageM: a.chainageM + edgeLen * t,
          lateralOffsetM: cross >= 0 ? -dist : dist,
          point: this.fromLocal(px, py),
          headingDeg: (toDeg(Math.atan2(ex, ey)) + 360) % 360,
          segmentId: ''
        };
      }
    }
    return best;
  }

  // ─── chainage queries ─────────────────────────────────────────────────────

  pointAtChainage(chainageM: number): Position | null {
    if (!this.hasRoute()) return null;
    const c = Math.max(0, Math.min(this.lengthM, chainageM));
    const i = this.edgeIndexForChainage(c);
    const a = this.vertices[i];
    const b = this.vertices[i + 1];
    const span = b.chainageM - a.chainageM;
    const t = span > 0 ? (c - a.chainageM) / span : 0;
    return this.fromLocal(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  }

  headingAtChainage(chainageM: number): number | null {
    if (!this.hasRoute()) return null;
    const c = Math.max(0, Math.min(this.lengthM, chainageM));
    const i = this.edgeIndexForChainage(c);
    const a = this.vertices[i];
    const b = this.vertices[i + 1];
    return (toDeg(Math.atan2(b.x - a.x, b.y - a.y)) + 360) % 360;
  }

  segmentAtChainage(chainageM: number): CorridorSegment | null {
    for (const r of this.ranges) {
      if (chainageM >= r.startChainageM && chainageM <= r.endChainageM) return r.segment;
    }
    return null;
  }

  nextJunctionFrom(chainageM: number): CorridorJunction | null {
    for (const j of this.junctions) {
      if (j.chainageM > chainageM + 1) return j;
    }
    return null;
  }

  distanceToJunctionFrom(chainageM: number): number | null {
    const j = this.nextJunctionFrom(chainageM);
    return j ? j.chainageM - chainageM : null;
  }

  halfWidthAtChainage(chainageM: number): number {
    return this.segmentAtChainage(chainageM)?.halfWidthM ?? DEFAULT_HALF_WIDTH_M;
  }

  // ─── position-based queries (spec surface) ────────────────────────────────

  getCurrentSegment(position: Position): CorridorSegment | null {
    const proj = this.projectToCorridor(position);
    return proj ? this.segmentAtChainage(proj.chainageM) : null;
  }

  getNextJunction(position: Position): JunctionNode | null {
    const proj = this.projectToCorridor(position);
    return proj ? this.nextJunctionFrom(proj.chainageM)?.node ?? null : null;
  }

  distanceToJunction(position: Position): number | null {
    const proj = this.projectToCorridor(position);
    return proj ? this.distanceToJunctionFrom(proj.chainageM) : null;
  }

  // ─── local projection plane ───────────────────────────────────────────────

  private toLocal(p: Position): { x: number; y: number } {
    const o = this.origin!;
    return {
      x: toRad(p.lng - o.lng) * EARTH_R * this.cosLat,
      y: toRad(p.lat - o.lat) * EARTH_R
    };
  }

  private fromLocal(x: number, y: number): Position {
    const o = this.origin!;
    return {
      lat: o.lat + toDeg(y / EARTH_R),
      lng: o.lng + toDeg(x / (EARTH_R * this.cosLat))
    };
  }

  private edgeIndexForChainage(c: number): number {
    // Binary search for the edge whose [start, end] chainage contains c.
    let lo = 0;
    let hi = this.vertices.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.vertices[mid].chainageM <= c) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
}
