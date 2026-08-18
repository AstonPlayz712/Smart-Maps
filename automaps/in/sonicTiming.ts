// automaps/in/sonicTiming.ts
//
// Sonic voice-timing hooks. AutoMaps IN lines up navigation voice cues with
// the camera's volumetric transitions so the spoken instruction lands exactly
// as the corridor/junction reveals — not a beat early, not late. The hooks
// schedule against the native audio engine's sample-accurate transport.

import type { IAudioEngine, VoiceCue } from '../../core/zante/native/audio/IAudioEngine';

export type SonicEvent =
  | 'corridor-enter'
  | 'junction-approach'
  | 'lane-change'
  | 'roundabout-enter'
  | 'roundabout-exit'
  | 'arrival';

export interface SonicCueSpec {
  event: SonicEvent;
  /** Voicepack line id (resolved by the host voice system, e.g. Sonic pack). */
  line: string;
  /** Lead time before the visual moment, seconds. Defaults per-event. */
  leadSeconds?: number;
  duck?: number;
}

/** Default timings tuned so the voice resolves as the visual transition peaks. */
export const DEFAULT_SONIC_TIMINGS: Record<SonicEvent, number> = {
  'corridor-enter': 0.2,
  'junction-approach': 1.2,
  'lane-change': 0.8,
  'roundabout-enter': 1.0,
  'roundabout-exit': 0.4,
  arrival: 0.0
};

/**
 * Schedules Sonic voice cues against the audio transport so they land in sync
 * with IN camera/corridor events. The camera state machine calls `cue(...)`
 * when it begins a transition; this computes the exact `whenSeconds` offset.
 */
export class SonicVoiceTiming {
  constructor(private readonly audio: IAudioEngine) {}

  /**
   * Fire a cue for `event`, scheduled so the spoken line resolves
   * `leadSeconds` before the visual moment that is `untilVisualSeconds` away.
   */
  cue(spec: SonicCueSpec, untilVisualSeconds: number): Promise<void> {
    const lead = spec.leadSeconds ?? DEFAULT_SONIC_TIMINGS[spec.event];
    const when = Math.max(0, untilVisualSeconds - lead);
    const cue: VoiceCue = {
      source: spec.line,
      whenSeconds: when,
      duck: spec.duck ?? 0.6,
      bus: 'voice'
    };
    return this.audio.speak(cue);
  }

  /** Current transport time — exposed so callers can align their own timers. */
  now(): number {
    return this.audio.now();
  }
}
