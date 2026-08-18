// engine/4d/weather.ts
//
// Weather state for the 4D temporal engine. Drives both routing caution and
// the renderer's atmosphere (the Weather Orb widget reads this too).

export type Sky = 'clear' | 'cloud' | 'rain' | 'snow' | 'fog' | 'storm';

export interface WeatherState {
  sky: Sky;
  /** 0..1 precipitation intensity. */
  precipitation: number;
  /** Metres of horizontal visibility. */
  visibilityM: number;
  windMps: number;
  tempC: number;
  atMs: number;
}

/** A driving-caution multiplier from weather: 1 = normal, >1 = slow down. */
export function weatherCaution(w: WeatherState): number {
  let c = 1;
  if (w.sky === 'rain') c += w.precipitation * 0.3;
  if (w.sky === 'snow') c += 0.5 + w.precipitation * 0.5;
  if (w.sky === 'fog') c += w.visibilityM < 200 ? 0.6 : 0.25;
  if (w.sky === 'storm') c += 0.7;
  return c;
}

export class WeatherModel {
  private current?: WeatherState;

  set(state: WeatherState): void {
    this.current = state;
  }

  get(): WeatherState | undefined {
    return this.current;
  }
}
