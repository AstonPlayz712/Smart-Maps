/**
 * A deterministic driving loop for DevShell. The simulated vehicle follows
 * this polyline forever, so position, heading and speed all move like a real
 * drive instead of sitting at a fixed point.
 *
 * Geometry is generated around whatever origin the engine boots at, so
 * DevShell works for any start location (London, Zante, anywhere).
 */

import type { DevShellPosition } from './types';

const EARTH_R = 6371000;

export interface RoutePose {
  position: DevShellPosition;
  headingDeg: number;
  /** Distance travelled along the loop, metres. */
  chainageM: number;
}

/**
 * Build a closed loop of `sizeM` metres around an origin.
 *
 * The default is deliberately tight (a ~250 m test circuit, so legs are ~500 m):
 * at the simulated cruise speed that puts a junction inside the Always-IN
 * approach envelope roughly every 25–30 s, so a developer sees the full
 * OFF → PREP → ACTIVE cycle within seconds of boot rather than after minutes of
 * driving. Pass a larger size (or a real polyline) for long-run testing.
 */
export function buildLoop(origin: DevShellPosition, sizeM = 250): [number, number][] {
  const dLat = (sizeM / EARTH_R) * (180 / Math.PI);
  const dLng = dLat / Math.cos((origin.lat * Math.PI) / 180);
  // A rounded rectangle: four straights joined by short diagonals, so the
  // simulated drive produces real heading changes (and therefore real turn
  // behaviour in the motion + Always-IN engines).
  return [
    [origin.lng - dLng, origin.lat - dLat],
    [origin.lng + dLng * 0.8, origin.lat - dLat],
    [origin.lng + dLng, origin.lat - dLat * 0.6],
    [origin.lng + dLng, origin.lat + dLat * 0.8],
    [origin.lng + dLng * 0.6, origin.lat + dLat],
    [origin.lng - dLng * 0.8, origin.lat + dLat],
    [origin.lng - dLng, origin.lat + dLat * 0.6],
    [origin.lng - dLng, origin.lat - dLat * 0.8],
    [origin.lng - dLng, origin.lat - dLat]
  ];
}

export class SimulatedRoute {
  private readonly points: [number, number][];
  private readonly cumulative: number[] = [];
  private readonly totalM: number;

  constructor(points: [number, number][]) {
    this.points = points.length >= 2 ? points : buildLoop({ lat: 0, lng: 0 });
    let total = 0;
    this.cumulative.push(0);
    for (let i = 1; i < this.points.length; i++) {
      total += haversineM(this.points[i - 1], this.points[i]);
      this.cumulative.push(total);
    }
    this.totalM = total || 1;
  }

  get lengthM(): number {
    return this.totalM;
  }

  /** Pose at a distance along the loop; wraps around so the drive never ends. */
  poseAt(distanceM: number): RoutePose {
    const chainage = ((distanceM % this.totalM) + this.totalM) % this.totalM;
    let i = 0;
    while (i < this.cumulative.length - 2 && this.cumulative[i + 1] < chainage) i++;

    const a = this.points[i];
    const b = this.points[i + 1] ?? this.points[0];
    const span = (this.cumulative[i + 1] ?? this.totalM) - this.cumulative[i];
    const t = span > 0 ? (chainage - this.cumulative[i]) / span : 0;

    return {
      position: {
        lng: a[0] + (b[0] - a[0]) * t,
        lat: a[1] + (b[1] - a[1]) * t
      },
      headingDeg: bearingDeg(a, b),
      chainageM: chainage
    };
  }
}

function haversineM(a: [number, number], b: [number, number]): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const la1 = toRad(a[1]);
  const la2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function bearingDeg(a: [number, number], b: [number, number]): number {
  const φ1 = toRad(a[1]);
  const φ2 = toRad(b[1]);
  const Δλ = toRad(b[0] - a[0]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;
