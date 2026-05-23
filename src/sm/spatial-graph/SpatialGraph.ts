import { POIS } from '../../data/pois';
import type { POI } from '../../engine/types';

const EARTH_M = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;

function haversine(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * SM Spatial Graph — proto POI index.
 *
 * Proto N is tiny (12 POIs in `src/data/pois.ts`), so linear scans beat
 * any structured index. Public API matches what the Auto-class native
 * graph will expose (`query` / `findNearest` / `byId` / `all`), so call
 * sites don't change when we swap the impl out for an R-tree or
 * H3-grid implementation under the hood.
 */
export class SpatialGraph {
  private nodes: POI[];

  constructor(nodes: POI[] = POIS) {
    this.nodes = nodes.slice();
  }

  /** All POIs within `radiusM` of (lat, lng), sorted nearest-first. */
  query(lat: number, lng: number, radiusM = 5000): POI[] {
    return this.nodes
      .map((p) => ({
        p,
        d: haversine({ lat, lng }, { lat: p.center[1], lng: p.center[0] })
      }))
      .filter((x) => x.d <= radiusM)
      .sort((a, b) => a.d - b.d)
      .map((x) => x.p);
  }

  /** Nearest single POI, or null when the index is empty. */
  findNearest(lat: number, lng: number): POI | null {
    let best: POI | null = null;
    let bestD = Infinity;
    for (const p of this.nodes) {
      const d = haversine({ lat, lng }, { lat: p.center[1], lng: p.center[0] });
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  byId(id: string): POI | null {
    return this.nodes.find((p) => p.id === id) ?? null;
  }

  byCategory(category: string): POI[] {
    return this.nodes.filter((p) => p.category === category);
  }

  all(): POI[] {
    return this.nodes.slice();
  }

  size(): number {
    return this.nodes.length;
  }
}
