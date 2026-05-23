export interface LatLng {
  lng: number;
  lat: number;
}

export interface CameraPose {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

export interface POI {
  id: string;
  name: string;
  center: [number, number];
  category?: string;
  description?: string;
}

export type StyleMode = 'day' | 'dusk' | 'night';

export type EngineEvents = {
  'engine:ready': undefined;
  'engine:toast': string;
  'route:start': { from: LatLng; to: LatLng };
  'route:done': { distanceMeters: number; durationSec: number };
  'route:clear': undefined;
  'camera:move': CameraPose;
  'mode:change': StyleMode;
  /** IN follow camera entered (state-change only, not per-tick). */
  'in:enter': { destination: LatLng };
  /** IN follow camera exited. */
  'in:exit': undefined;
  /** IN junction approach flipped (inJunction true → entering; false → leaving). */
  'in:junction': { inJunction: boolean; distanceMeters: number };
  /** IN camera switched to wider FOV because of high speed. */
  'in:zoomout': { speedMps: number };
  /** VoiceEngine started speaking an utterance. Media services duck on this. */
  'voice:speak-start': { text: string };
  /** VoiceEngine finished (or cancelled) an utterance. */
  'voice:speak-end': undefined;
};
