// engine/6d/BehaviourEngine.ts
//
// 6D — the behaviour dimension. Learns the individual driver: roads they
// habitually take, roads/areas they consistently avoid, and standing
// preferences (no motorways, prefer scenic, etc.). Turns observed history into
// routing bias so the system routes the way *this* person actually drives.

import type {
  IDimension,
  DimensionHost,
  DynamicContext,
  DimensionLayer
} from '../types';

export interface RoutePreferences {
  avoidMotorways: boolean;
  avoidTolls: boolean;
  preferScenic: boolean;
  /** Explicit per-segment avoidance the user set. */
  avoidedSegmentIds: string[];
}

export interface BehaviourPayload {
  /** Segment id → habit strength 0..1 (how often the user takes it). */
  habits: Record<string, number>;
  /** Segment id → learned avoidance 0..1. */
  avoidance: Record<string, number>;
  preferences: RoutePreferences;
}

const DEFAULT_PREFS: RoutePreferences = {
  avoidMotorways: false,
  avoidTolls: false,
  preferScenic: false,
  avoidedSegmentIds: []
};

/**
 * Habits and avoidance are exponential moving averages over observed segment
 * traversals: taking a segment raises its habit weight; routing around an
 * offered segment raises its avoidance weight. Learning runs on the background
 * lane so it never touches the frame budget.
 */
export class BehaviourEngine implements IDimension<BehaviourPayload> {
  readonly id = '6d' as const;
  private host?: DimensionHost;
  private habits = new Map<string, number>();
  private avoidance = new Map<string, number>();
  private prefs: RoutePreferences = { ...DEFAULT_PREFS };

  init(host: DimensionHost): void {
    this.host = host;
  }

  setPreferences(p: Partial<RoutePreferences>): void {
    this.prefs = { ...this.prefs, ...p };
  }

  /** The user drove this segment — reinforce the habit. */
  observeTraversal(segmentId: string): void {
    this.host?.schedule(3, () => {
      this.habits.set(segmentId, ema(this.habits.get(segmentId) ?? 0, 1));
      this.avoidance.set(segmentId, ema(this.avoidance.get(segmentId) ?? 0, 0));
    });
  }

  /** The user was offered this segment and went around it — reinforce avoidance. */
  observeAvoided(segmentId: string): void {
    this.host?.schedule(3, () => {
      this.avoidance.set(segmentId, ema(this.avoidance.get(segmentId) ?? 0, 1));
    });
  }

  update(_ctx: DynamicContext, _dt: number): DimensionLayer<BehaviourPayload> {
    const habits = Object.fromEntries(this.habits);
    const avoidance = Object.fromEntries(this.avoidance);

    const scores = [];
    for (const [seg, w] of this.habits) {
      if (w > 0.5) scores.push({ dimension: this.id, weight: w * 0.4, reason: `habitual ${seg}` });
    }
    for (const [seg, w] of this.avoidance) {
      if (w > 0.5) scores.push({ dimension: this.id, weight: -w, reason: `usually avoids ${seg}` });
    }
    if (this.prefs.avoidMotorways) {
      scores.push({ dimension: this.id, weight: -0.5, reason: 'prefers no motorways' });
    }
    if (this.prefs.preferScenic) {
      scores.push({ dimension: this.id, weight: 0.3, reason: 'prefers scenic' });
    }

    return { dimension: this.id, payload: { habits, avoidance, preferences: this.prefs }, scores };
  }

  dispose(): void {
    this.habits.clear();
    this.avoidance.clear();
  }
}

/** Exponential moving average with a slow learning rate. */
function ema(prev: number, sample: number, alpha = 0.2): number {
  return prev + alpha * (sample - prev);
}
