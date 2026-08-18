/**
 * Path playback — drives a scripted journey: an explicit GNSS path, plus
 * optional motion-state and Always-IN timelines.
 *
 * This is the mode for reproducing a specific journey. Given the same sequence
 * of dt values it produces byte-identical samples (positions, headings, speeds,
 * accuracies, motion states) — the only wall-clock value is `timestampMs`,
 * which must track `Date.now()` because the engines judge fix freshness
 * against it.
 */

import type { DevShellConfig } from './config';
import type {
  DevShellImuSample,
  DevShellINState,
  DevShellMotionState,
  DevShellSample,
  GnssPathPoint,
  JourneyScript,
  SimulationScript
} from './types';

const EARTH_R = 6371000;

export class PathPlaybackScript implements SimulationScript {
  readonly mode = 'path' as const;
  readonly deterministic = true;
  readonly name: string;

  private readonly journey: JourneyScript;
  private readonly baseSpeed: number;
  private readonly baseAccuracy: number;
  private readonly rateHz: number;

  /** Index of the leg currently being travelled. */
  private leg = 0;
  /** Distance travelled along the current leg, metres. */
  private legProgressM = 0;
  /** Seconds already spent dwelling at the current waypoint. */
  private dwellElapsed = 0;
  private elapsed = 0;
  private finished = false;
  private lastSpeed = 0;

  constructor(journey: JourneyScript, config: DevShellConfig) {
    this.journey = journey;
    this.name = `Path playback — ${journey.name}`;
    this.baseSpeed = journey.speedMps ?? config.speedMps;
    this.baseAccuracy = journey.accuracyM ?? config.accuracyM;
    this.rateHz = config.updateRateHz;
  }

  advance(dtSeconds: number): DevShellSample {
    const dt = Math.max(0, Math.min(1, dtSeconds));
    this.elapsed += dt;

    const path = this.journey.path;
    const from = path[Math.min(this.leg, path.length - 1)];
    const to = path[Math.min(this.leg + 1, path.length - 1)];

    // Dwell at a waypoint before setting off toward the next one.
    const holdFor = from.holdSeconds ?? 0;
    let moving = true;
    if (this.dwellElapsed < holdFor) {
      this.dwellElapsed += dt;
      moving = false;
    }

    const legSpeed = from.speedMps ?? this.baseSpeed;
    const legLength = haversineM(from, to);

    if (moving && !this.finished && legLength > 0) {
      this.legProgressM += legSpeed * dt;
      while (this.legProgressM >= legLength && !this.finished) {
        this.legProgressM -= legLength;
        this.leg++;
        this.dwellElapsed = 0;
        if (this.leg >= path.length - 1) {
          if (this.journey.loop === false) {
            this.finished = true;
            this.leg = path.length - 2;
            this.legProgressM = legLength;
          } else {
            this.leg = 0;
          }
        }
        break;
      }
    }

    const t = legLength > 0 ? Math.min(1, this.legProgressM / legLength) : 0;
    const position = {
      lat: from.lat + (to.lat - from.lat) * t,
      lng: from.lng + (to.lng - from.lng) * t
    };

    const speed = !moving || this.finished ? 0 : legSpeed;
    this.lastSpeed = speed;

    const headingDeg = from.headingDeg ?? bearingDeg(from, to);
    const accuracyM = from.accuracyM ?? this.baseAccuracy;

    return {
      position,
      accuracyM,
      motionState: this.motionState(speed),
      confidence: this.confidence(speed),
      headingDeg: round(headingDeg, 2),
      speedMps: round(speed, 3),
      updateRateHz: this.rateHz,
      timestampMs: Date.now(),
      simulated: true
    };
  }

  imu(): DevShellImuSample {
    const driving = this.lastSpeed > 1;
    return {
      accelMagnitude: driving ? 0.5 + 0.3 * Math.sin(this.elapsed * 6.1) : 0.01,
      gyroMagnitude: driving ? 0.05 : 0.004,
      timestampMs: Date.now()
    };
  }

  /**
   * The scripted Always-IN state for this instant, or null when the journey
   * carries no timeline (then the live engine drives it).
   */
  scriptedIN(): DevShellINState | null {
    const timeline = this.journey.inTimeline;
    if (!timeline || timeline.length === 0) return null;

    const total = timeline.reduce((sum, phase) => sum + phase.seconds, 0);
    if (total <= 0) return null;

    // Hold on the final phase once the timeline is spent, unless looping.
    let t = this.elapsed;
    if (t >= total) {
      if (this.journey.loop === false) return timeline[timeline.length - 1].state;
      t = t % total;
    }

    let acc = 0;
    for (const phase of timeline) {
      acc += phase.seconds;
      if (t < acc) return phase.state;
    }
    return timeline[timeline.length - 1].state;
  }

  corridor(): [number, number][] {
    return this.journey.path.map((p) => [p.lng, p.lat] as [number, number]);
  }

  reset(): void {
    this.leg = 0;
    this.legProgressM = 0;
    this.dwellElapsed = 0;
    this.elapsed = 0;
    this.finished = false;
    this.lastSpeed = 0;
  }

  // ─── motion ───────────────────────────────────────────────────────────────

  private motionState(speed: number): DevShellMotionState {
    // A scripted motion sequence wins when the journey provides one.
    const sequence = this.journey.motionSequence;
    if (sequence && sequence.length > 0) {
      const total = sequence.reduce((sum, phase) => sum + phase.seconds, 0);
      if (total > 0) {
        let t = this.elapsed % total;
        let acc = 0;
        for (const phase of sequence) {
          acc += phase.seconds;
          if (t < acc) return phase.state;
        }
      }
    }
    if (speed < 0.5) return 'still';
    if (speed < 2.5) return 'walking';
    return 'driving';
  }

  private confidence(speed: number): number {
    // Playback is a clean signal: high confidence, dipping briefly at stops.
    return speed < 0.5 ? 0.8 : 0.93;
  }
}

// ─── geo helpers ────────────────────────────────────────────────────────────

function haversineM(a: GnssPathPoint, b: GnssPathPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function bearingDeg(a: GnssPathPoint, b: GnssPathPoint): number {
  const p1 = toRad(a.lat);
  const p2 = toRad(b.lat);
  const dl = toRad(b.lng - a.lng);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;
const round = (v: number, dp: number) => Number(v.toFixed(dp));
