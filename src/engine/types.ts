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
};
