// engine/5d/ContextEngine.ts
//
// 5D — the context dimension. Models the *situation* of a trip rather than the
// road: how familiar the driver is with the area, what kind of trip this is,
// and the live stress / urgency the route should respond to. These bias the
// router and the presentation (calmer guidance when stress is high, etc.).

import type {
  IDimension,
  DimensionHost,
  DynamicContext,
  DimensionLayer,
  GeoCoord
} from '../types';

export type TripType = 'commute' | 'errand' | 'leisure' | 'unfamiliar' | 'emergency';

export interface ContextSignals {
  /** 0 (never been here) … 1 (knows it cold). */
  familiarity: number;
  tripType: TripType;
  /** 0 (calm) … 1 (highly stressed) — from cadence, braking, time pressure. */
  stress: number;
  /** 0 (no rush) … 1 (must arrive ASAP). */
  urgency: number;
}

export interface ContextPayload extends ContextSignals {
  /** Suggested guidance verbosity, derived from stress + familiarity. */
  guidance: 'minimal' | 'normal' | 'reassuring';
}

/**
 * Familiarity is learned by counting visits to an area grid cell. Stress and
 * urgency are fed from the app (deadline proximity, driving telemetry); the
 * engine smooths them and turns them into routing + presentation bias.
 */
export class ContextEngine implements IDimension<ContextPayload> {
  readonly id = '5d' as const;
  private host?: DimensionHost;
  private visits = new Map<string, number>();
  private signals: ContextSignals = {
    familiarity: 0,
    tripType: 'unfamiliar',
    stress: 0,
    urgency: 0
  };

  init(host: DimensionHost): void {
    this.host = host;
  }

  setTripType(t: TripType): void {
    this.signals.tripType = t;
  }

  reportStress(value: number): void {
    this.signals.stress = clamp01(value);
  }

  reportUrgency(value: number): void {
    this.signals.urgency = clamp01(value);
  }

  /** Record a visit so familiarity for that area rises over time. */
  recordVisit(loc: GeoCoord): void {
    const cell = gridCell(loc);
    this.visits.set(cell, (this.visits.get(cell) ?? 0) + 1);
  }

  private familiarityAt(loc: GeoCoord): number {
    const n = this.visits.get(gridCell(loc)) ?? 0;
    return 1 - Math.exp(-n / 5); // saturates toward 1 with repeated visits
  }

  update(ctx: DynamicContext, _dt: number): DimensionLayer<ContextPayload> {
    const familiarity = this.familiarityAt(ctx.ego.location);
    this.signals.familiarity = familiarity;
    const { stress, urgency, tripType } = this.signals;

    const guidance: ContextPayload['guidance'] =
      stress > 0.6 ? 'reassuring' : familiarity > 0.7 ? 'minimal' : 'normal';

    const scores = [];
    if (urgency > 0.5) {
      scores.push({ dimension: this.id, weight: urgency, reason: 'prefer fastest (urgent)' });
    }
    if (familiarity < 0.3 && tripType !== 'emergency') {
      scores.push({ dimension: this.id, weight: 0.3, reason: 'prefer simple roads (unfamiliar)' });
    }
    if (stress > 0.6) {
      scores.push({ dimension: this.id, weight: 0.4, reason: 'prefer low-complexity (high stress)' });
    }

    this.host?.signal('5d:guidance', guidance);
    return { dimension: this.id, payload: { ...this.signals, familiarity, guidance }, scores };
  }

  dispose(): void {
    this.visits.clear();
  }
}

function gridCell(loc: GeoCoord): string {
  // ~1km cells: round to 2 dp lat/lng.
  return `${loc.lat.toFixed(2)},${loc.lng.toFixed(2)}`;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
