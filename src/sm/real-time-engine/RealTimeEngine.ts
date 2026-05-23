import type { LatLng } from '../../engine/types';

export type HazardKind = 'traffic' | 'camera' | 'roadworks' | 'accident' | 'closure';

export interface Hazard {
  id: string;
  kind: HazardKind;
  location: LatLng;
  severity: 'low' | 'medium' | 'high';
  description?: string;
}

export interface TrafficSegment {
  startLoc: LatLng;
  endLoc: LatLng;
  freeFlowSpeedKmh: number;
  currentSpeedKmh: number;
  congestion: 'light' | 'moderate' | 'heavy' | 'standstill';
}

export interface BoundingBox {
  min: LatLng;
  max: LatLng;
}

type Unsubscribe = () => void;
type HazardListener = (h: Hazard) => void;

/**
 * SM Real-Time Engine — proto stub.
 *
 * Surface is stable. The Auto-class build will consume a live data feed
 * (TomTom Traffic, HERE, or a self-hosted aggregator) and emit hazards
 * through `onHazard`. Proto returns empty data and never fires events.
 *
 * Inject hazards manually in dev with `_injectHazard(h)` — handy for
 * exercising the voice system's hazard.* line set without a live feed.
 */
export class RealTimeEngine {
  private hazardSubs = new Set<HazardListener>();

  getTrafficAt(_bbox: BoundingBox): TrafficSegment[] {
    return [];
  }

  getHazards(): Hazard[] {
    return [];
  }

  onHazard(cb: HazardListener): Unsubscribe {
    this.hazardSubs.add(cb);
    return () => {
      this.hazardSubs.delete(cb);
    };
  }

  /** Dev helper — fire a synthetic hazard through the subscriber set. */
  _injectHazard(h: Hazard): void {
    this.hazardSubs.forEach((cb) => {
      try {
        cb(h);
      } catch (err) {
        console.error('[RealTimeEngine] hazard listener', err);
      }
    });
  }
}
