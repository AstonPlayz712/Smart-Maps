// engine/4d/traffic.ts
//
// Live traffic model for the 4D temporal engine. Maps road segment ids to a
// congestion level + speed ratio. Feeds both routing cost and the colour the
// 3D road ribbons are re-toned to.

export type Congestion = 'free' | 'light' | 'moderate' | 'heavy' | 'standstill';

export interface TrafficReading {
  segmentId: string;
  /** current / free-flow speed, 0..1 (1 = wide open). */
  speedRatio: number;
  congestion: Congestion;
  /** When this reading was taken, epoch ms. */
  atMs: number;
}

const RATIO_TO_CONGESTION: [number, Congestion][] = [
  [0.85, 'free'],
  [0.65, 'light'],
  [0.4, 'moderate'],
  [0.15, 'heavy'],
  [0, 'standstill']
];

export function congestionFor(speedRatio: number): Congestion {
  for (const [t, c] of RATIO_TO_CONGESTION) if (speedRatio >= t) return c;
  return 'standstill';
}

/** Routing penalty for a segment: higher = slower = avoid. 0..1. */
export function trafficPenalty(reading: TrafficReading | undefined): number {
  if (!reading) return 0;
  return 1 - reading.speedRatio;
}

export class TrafficModel {
  private readings = new Map<string, TrafficReading>();

  ingest(reading: TrafficReading): void {
    this.readings.set(reading.segmentId, reading);
  }

  get(segmentId: string): TrafficReading | undefined {
    return this.readings.get(segmentId);
  }

  all(): TrafficReading[] {
    return [...this.readings.values()];
  }
}
