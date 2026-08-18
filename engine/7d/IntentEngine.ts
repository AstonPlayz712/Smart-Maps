// engine/7d/IntentEngine.ts
//
// 7D — the intent dimension. The top of the stack: *why* this trip is
// happening. Purpose, the emotional weight of the destination, and how firm
// the destination intent is. This is the lightest-touch dimension (it nudges,
// never overrides geometry) but it shapes tone, suggestions, and arrival.

import type {
  IDimension,
  DimensionHost,
  DynamicContext,
  DimensionLayer,
  GeoCoord
} from '../types';

export type Purpose =
  | 'home'
  | 'work'
  | 'appointment'
  | 'social'
  | 'care' // hospital, family in need
  | 'explore'
  | 'unknown';

export interface IntentState {
  purpose: Purpose;
  /** -1 (dreaded) … 0 (neutral) … +1 (looked-forward-to). */
  emotionalWeight: number;
  /** 0 (wandering) … 1 (locked-in destination). */
  destinationIntent: number;
  destination?: GeoCoord;
}

export interface IntentPayload extends IntentState {
  /** Presentation tone the UI/voice should adopt. */
  tone: 'calm' | 'neutral' | 'upbeat' | 'urgent-care';
}

/**
 * Intent is set explicitly (a calendar event, a chosen destination) or inferred
 * from purpose + time. The engine maps it to a presentation tone and a gentle
 * routing bias (e.g. 'care' purpose → prefer reliability over speed-thrill).
 */
export class IntentEngine implements IDimension<IntentPayload> {
  readonly id = '7d' as const;
  private host?: DimensionHost;
  private state: IntentState = {
    purpose: 'unknown',
    emotionalWeight: 0,
    destinationIntent: 0
  };

  init(host: DimensionHost): void {
    this.host = host;
  }

  setIntent(state: Partial<IntentState>): void {
    this.state = { ...this.state, ...state };
  }

  private toneFor(s: IntentState): IntentPayload['tone'] {
    if (s.purpose === 'care') return 'urgent-care';
    if (s.emotionalWeight > 0.4) return 'upbeat';
    if (s.emotionalWeight < -0.4) return 'calm';
    return 'neutral';
  }

  update(ctx: DynamicContext, _dt: number): DimensionLayer<IntentPayload> {
    // Firm up destination intent when an explicit destination is active.
    if (ctx.destination) {
      this.state.destination = ctx.destination;
      this.state.destinationIntent = Math.max(this.state.destinationIntent, 0.8);
    }
    const tone = this.toneFor(this.state);

    const scores = [];
    if (this.state.purpose === 'care') {
      scores.push({ dimension: this.id, weight: 0.6, reason: 'prefer reliable route (care trip)' });
    }
    if (this.state.purpose === 'explore' && this.state.destinationIntent < 0.4) {
      scores.push({ dimension: this.id, weight: 0.3, reason: 'allow scenic detours (exploring)' });
    }
    if (this.state.emotionalWeight < -0.4) {
      scores.push({ dimension: this.id, weight: 0.2, reason: 'calmer pacing (dreaded trip)' });
    }

    this.host?.signal('7d:tone', tone);
    return { dimension: this.id, payload: { ...this.state, tone }, scores };
  }

  dispose(): void {
    /* intent has no streamed resources */
  }
}
