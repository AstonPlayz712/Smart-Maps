// engine/4d/TemporalEngine.ts
//
// 4D — the temporal dimension. Folds live traffic, weather, the rush-hour
// prior, and discrete delays into a per-segment time cost and a set of routing
// scores. This is what makes the same road "different" at 8am vs 8pm.

import type {
  IDimension,
  DimensionHost,
  DynamicContext,
  DimensionLayer
} from '../types';
import { TrafficModel, trafficPenalty, congestionFor, type TrafficReading } from './traffic';
import { WeatherModel, weatherCaution, type WeatherState } from './weather';
import { rushFactor, isRushHour } from './rushHour';
import { DelayModel, type DelayEvent } from './delays';

export interface TemporalPayload {
  rush: number;
  isRush: boolean;
  caution: number;
  /** Segment id → effective slowdown 0..1 (1 = avoid). */
  segmentCost: Record<string, number>;
}

export class TemporalEngine implements IDimension<TemporalPayload> {
  readonly id = '4d' as const;
  readonly traffic = new TrafficModel();
  readonly weather = new WeatherModel();
  readonly delays = new DelayModel();
  private host?: DimensionHost;

  init(host: DimensionHost): void {
    this.host = host;
  }

  ingestTraffic(r: TrafficReading): void {
    this.traffic.ingest(r);
  }

  setWeather(w: WeatherState): void {
    this.weather.set(w);
  }

  addDelay(e: DelayEvent): void {
    this.delays.add(e);
  }

  update(ctx: DynamicContext, _dt: number): DimensionLayer<TemporalPayload> {
    const rush = rushFactor(ctx.epochMs);
    const isRush = isRushHour(ctx.epochMs);
    const w = this.weather.get();
    const caution = w ? weatherCaution(w) : 1;

    const segmentCost: Record<string, number> = {};
    for (const reading of this.traffic.all()) {
      const delaySec = this.delays.delaySeconds(reading.segmentId, ctx.epochMs);
      const live = trafficPenalty(reading);
      // Blend live reading with the rush prior; hard closures pin to 1.
      const blended = Number.isFinite(delaySec)
        ? Math.min(1, Math.max(live, rush * 0.5) + Math.min(0.5, delaySec / 600))
        : 1;
      segmentCost[reading.segmentId] = blended;
    }

    const scores = [];
    if (isRush) {
      scores.push({
        dimension: this.id,
        weight: -rush,
        reason: `rush hour (${Math.round(rush * 100)}%)`
      });
    }
    if (caution > 1.1) {
      scores.push({
        dimension: this.id,
        weight: -(caution - 1),
        reason: `weather caution ×${caution.toFixed(2)}`
      });
    }

    this.host?.signal('4d:tick', { rush, caution });

    return {
      dimension: this.id,
      payload: { rush, isRush, caution, segmentCost },
      scores
    };
  }

  dispose(): void {
    this.delays.prune(Number.MAX_SAFE_INTEGER);
  }

  /** Convenience re-export so callers can label a reading without importing. */
  classify = congestionFor;
}
