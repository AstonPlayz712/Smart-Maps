// core/zante/native/audio/IAudioEngine.ts
//
// Native audio surface. The Z Build leaned on the WebView's <audio> element
// and the browser TTS. A/E owns a native spatial mixer so navigation voice,
// media ducking, and 3D cues share one clock — and so Sonic voice-timing
// hooks (AutoMaps IN) can schedule against sample-accurate playback.

import type { Vec3 } from '../types';

export type BusId = 'voice' | 'media' | 'sfx' | 'ambience';

export interface VoiceCue {
  /** Pre-synthesised PCM or a voicepack line id resolved by the host. */
  source: string;
  /** Schedule offset from now, seconds. Sonic timing uses this. */
  whenSeconds?: number;
  /** Ducks the media bus by this gain (0..1) for the cue's duration. */
  duck?: number;
  bus?: BusId;
}

export interface SpatialEmitter {
  position: Vec3;
  /** 0..1 — distance attenuation reference. */
  gain?: number;
  loop?: boolean;
  source: string;
}

/**
 * Native audio engine. Mixing, ducking and spatialisation are all native;
 * nothing routes through a WebView. The voice bus exposes precise scheduling
 * so AutoMaps IN can line up a turn cue with the camera's junction transition.
 */
export interface IAudioEngine {
  start(): void;
  stop(): void;

  /** Schedule a navigation/voice cue; resolves when playback completes. */
  speak(cue: VoiceCue): Promise<void>;

  /** Set/duck a bus gain (0..1). */
  setBusGain(bus: BusId, gain: number): void;

  /** Place or update a spatial emitter; returns its handle id. */
  emit(emitter: SpatialEmitter): number;
  stopEmitter(id: number): void;

  /** Move the listener (camera) so spatial cues track the view. */
  setListener(position: Vec3, forward: Vec3, up: Vec3): void;

  /** Sample-accurate transport time, seconds — Sonic hooks schedule on this. */
  now(): number;
}
