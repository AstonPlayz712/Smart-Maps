export type ProviderId =
  | 'wifi'
  | 'bluetooth'
  | 'autoex'
  | 'sensor-fusion'
  | 'manual';

export interface LocationFix {
  lng: number;
  lat: number;
  /** Estimated radius of uncertainty in meters. */
  accuracy?: number;
  /** Heading in degrees from true north, [0, 360). */
  heading?: number | null;
  /** Speed in meters / second. */
  speed?: number | null;
  /** Which provider emitted this fix. */
  source: ProviderId;
  /** Epoch ms when the fix was produced. */
  timestamp: number;
}

export type LocationListener = (fix: LocationFix) => void;
export type Unsubscribe = () => void;

export interface LocationProvider {
  readonly id: ProviderId;
  readonly name: string;
  start(): Promise<void> | void;
  stop(): void;
  isAvailable(): boolean;
  isActive(): boolean;
  onUpdate(cb: LocationListener): Unsubscribe;
  getLast(): LocationFix | null;
}

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  available: boolean;
  active: boolean;
  primary: boolean;
  lastAt: number | null;
}
