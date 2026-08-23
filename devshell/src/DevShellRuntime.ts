/**
 * DevShellRuntime — the replacement wiring for SM's hardware-backed engines
 * when no native core is present.
 *
 * On a native host these feeds come from GNSS + CoreMotion/SensorManager and
 * drive dead reckoning, Always-IN and the Dynamic Engine. In DevShell a
 * configurable `SimulationScript` (see `devshell/sim/`) serves all of them:
 *
 *   simulated GNSS  → LocationProviders (via SimulatedLocationProvider)
 *   simulated GNSS  → SMCore.pushGnss     (position / DR / Always-IN)
 *   simulated IMU   → SMCore.pushImu      (motion confidence / DR)
 *   simulated pose  → Dynamic Engine ego  (3D…7D pipeline)
 *
 * The script is chosen by `DevShellConfig.mode`:
 *   looped   — the default drive loop (live Always-IN engine)
 *   path     — scripted journey playback (may script Always-IN outright)
 *   static   — fixed pose for UI debugging
 *   chaotic  — randomised noise and motion, to stress the engines
 *
 * BOOT CONTRACT: `start()` publishes the first fix, the first IMU packet, the
 * first ego pose and the first Always-IN state **before it returns**. Nothing
 * downstream waits on a lock that will never arrive.
 */

import { SMCore } from '../../sm-core/ae/dynamic/SMCore';
import type { CorridorSegment, INViewModel, JunctionNode } from '../../sm-core/ae/dynamic/types';
import { EgoPoseTracker, type EgoPose } from '../../sm-core/ae/EgoPose';
import { IMUProcessor } from '../../sm-core/ae/IMU';
import { AlwaysINTracker, type AlwaysINState } from '../../sm-core/ae/AlwaysIN';
import { emptyPosition, type SMPosition } from '../../sm-core/ae/Position';
import { SimulatedLocationProvider } from './SimulatedLocationProvider';
import { createSimulation, resolveDevShellConfig } from '../sim';
import type { DevShellConfig } from '../sim/config';
import type { DevShellINState, SimulationScript } from '../sim/types';
import type { DevShellImuSample, DevShellSample } from './types';

/**
 * DevShell's ego pose. This is the full 3–7D pose — `z` is metres above venue
 * ground, so the Dynamic Engine and the map renderer receive the vertical
 * dimension from the simulation exactly as they would from hardware.
 */
export interface DevShellEgo {
  location: { lng: number; lat: number };
  /** Vertical position, metres above venue ground. */
  z: number;
  headingDeg: number;
  speedMps: number;
  verticalRateMps: number;
  floorLevel: number | null;
  verticalMotionState: SMPosition['verticalMotionState'];
  /** Epoch ms this pose represents — same field the engine's EgoPose carries. */
  timestampMs: number;
}

export interface DevShellStatus {
  active: true;
  mode: DevShellConfig['mode'];
  simulation: string;
  deterministic: boolean;
  sample: DevShellSample | null;
  /** The full 3–7D position the simulation is emitting. */
  position: SMPosition;
  /** Always-IN including the vertical phase. */
  alwaysIN: AlwaysINState | null;
  /** DevShell's Always-IN state — a superset of the engine's (adds HOLD). */
  inState: DevShellINState;
  /** The raw engine state, for anything that only knows the four. */
  engineINState: INViewModel['state'] | 'OFF';
  updateRateHz: number;
}

/** Dwell needed before an ACTIVE corridor is reported as HOLD. */
const HOLD_DWELL_SECONDS = 2.5;

export class DevShellRuntime {
  readonly provider: SimulatedLocationProvider;
  readonly core: SMCore;
  readonly config: DevShellConfig;
  readonly simulation: SimulationScript;

  private readonly tickMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTickAt = 0;
  private lastViewModel: INViewModel | null = null;
  private lastEgo: DevShellEgo | null = null;
  private lastImu: DevShellImuSample | null = null;
  private lastPosition: SMPosition = emptyPosition();
  private lastAlwaysIN: AlwaysINState | null = null;
  private readonly imuProcessor = new IMUProcessor();
  private readonly egoTracker = new EgoPoseTracker();
  private readonly alwaysIN = new AlwaysINTracker();
  private lastSampleAt = 0;
  private stoppedFor = 0;
  private egoSinks = new Set<(ego: DevShellEgo) => void>();
  private imuSinks = new Set<(imu: DevShellImuSample) => void>();
  private started = false;

  constructor(origin: { lat: number; lng: number }, config: Partial<DevShellConfig> = {}) {
    this.config = resolveDevShellConfig(config);
    this.simulation = createSimulation(origin, this.config);
    this.provider = new SimulatedLocationProvider(this.simulation, this.config.updateRateHz);
    this.core = new SMCore();
    this.tickMs = 1000 / this.config.updateRateHz;
  }

  // ─── lifecycle ────────────────────────────────────────────────────────────

  start(): void {
    if (this.started) return;
    this.started = true;

    this.core.init();
    const [segments, junctions] = this.buildCorridor();
    if (segments.length > 0) this.core.setRoute(segments, junctions);

    // Subscribe *before* starting the provider so the very first simulated
    // sample is ingested rather than missed.
    this.provider.onSample((sample) => this.ingest(sample));

    // Publishes the first fix synchronously, which cascades into the first IMU
    // packet and the first ego pose through ingest().
    this.provider.start();

    this.lastTickAt = Date.now();
    // One tick now, so the first Always-IN state exists before start() returns.
    this.tick(this.tickMs);

    this.timer = setInterval(() => {
      const now = Date.now();
      const dt = now - this.lastTickAt;
      this.lastTickAt = now;
      this.tick(dt);
    }, this.tickMs);
  }

  stop(): void {
    this.started = false;
    this.provider.stop();
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.egoSinks.clear();
    this.imuSinks.clear();
    this.imuProcessor.reset();
    this.egoTracker.reset();
    this.alwaysIN.reset();
  }

  // ─── consumers ────────────────────────────────────────────────────────────

  /** Route simulated ego states into the Dynamic Engine (or anything else). */
  onEgo(sink: (ego: DevShellEgo) => void): () => void {
    this.egoSinks.add(sink);
    if (this.lastEgo) sink(this.lastEgo);
    return () => {
      this.egoSinks.delete(sink);
    };
  }

  /** Subscribe to the simulated IMU stream. */
  onImu(sink: (imu: DevShellImuSample) => void): () => void {
    this.imuSinks.add(sink);
    if (this.lastImu) sink(this.lastImu);
    return () => {
      this.imuSinks.delete(sink);
    };
  }

  getEgo(): DevShellEgo | null {
    return this.lastEgo;
  }

  getImu(): DevShellImuSample | null {
    return this.lastImu;
  }

  getINViewModel(): INViewModel | null {
    return this.lastViewModel;
  }

  /** The full 3–7D position — published before start() returns. */
  getPosition(): SMPosition {
    return this.lastPosition;
  }

  /** Always-IN including its vertical phase. */
  getAlwaysIN(): AlwaysINState | null {
    return this.lastAlwaysIN;
  }

  /** Venue the active simulation walks, when it is an indoor journey. */
  venueId(): string | null {
    const sim = this.simulation as { venueId?: () => string };
    return typeof sim.venueId === 'function' ? sim.venueId() : null;
  }

  /** DevShell's Always-IN state — scripted when the journey says so. */
  getINState(): DevShellINState {
    const scripted = this.simulation.scriptedIN();
    if (scripted) return scripted;
    return this.deriveINState();
  }

  status(): DevShellStatus {
    const sample = this.provider.getLastSample();
    return {
      active: true,
      position: this.lastPosition,
      alwaysIN: this.lastAlwaysIN,
      mode: this.config.mode,
      simulation: this.simulation.name,
      deterministic: this.simulation.deterministic,
      sample,
      inState: this.getINState(),
      engineINState: this.lastViewModel?.state ?? 'OFF',
      updateRateHz: sample?.updateRateHz ?? this.config.updateRateHz
    };
  }

  // ─── internals ────────────────────────────────────────────────────────────

  private ingest(sample: DevShellSample): void {
    const now = sample.timestampMs;
    const dtSeconds = this.lastSampleAt > 0 ? Math.max(0.001, (now - this.lastSampleAt) / 1000) : 1 / this.config.updateRateHz;
    this.lastSampleAt = now;

    // GNSS — the same shape CoreLocation/LocationManager would deliver.
    this.core.pushGnss({
      position: { lat: sample.position.lat, lng: sample.position.lng },
      speedMps: sample.speedMps,
      headingDeg: sample.headingDeg,
      accuracyM: sample.accuracyM,
      timestampMs: sample.timestampMs
    });

    // IMU — drives motion confidence, dead reckoning and the vertical channel.
    const imu = this.provider.imu();
    this.lastImu = imu;
    this.imuProcessor.push({
      accelMagnitude: imu.accelMagnitude,
      verticalAccel: imu.verticalAccel,
      gyroMagnitude: imu.gyroMagnitude,
      barometricAltitudeM: imu.barometricAltitudeM,
      timestampMs: imu.timestampMs
    });
    const motion = this.imuProcessor.update(dtSeconds * 1000, sample.speedMps);
    this.core.pushImu(imu);
    this.core.pushCompassHeading(sample.headingDeg, sample.timestampMs);
    for (const sink of this.imuSinks) {
      try {
        sink(imu);
      } catch (err) {
        console.error('[devshell] imu sink error', err);
      }
    }

    // Full 3–7D position: the simulation is authoritative for the vertical
    // fields; the IMU classifier corroborates them.
    const position: SMPosition = {
      lat: sample.position.lat,
      lng: sample.position.lng,
      accuracyM: sample.accuracyM,
      headingDeg: sample.headingDeg,
      speedMps: sample.speedMps,
      floorLevel: sample.floorLevel,
      altitudeM: sample.altitudeM,
      verticalAccuracyM: sample.verticalAccuracyM,
      verticalMotionState: sample.verticalMotionState,
      verticalTransitionConfidence: sample.verticalTransitionConfidence,
      timestampMs: sample.timestampMs,
      venueId: sample.venueId,
      simulated: true
    };
    this.lastPosition = position;

    // Ego pose — the Dynamic Engine's 3D…7D input, now with z.
    const pose = this.egoTracker.update(position, motion.verticalRateMps, dtSeconds);
    this.lastAlwaysIN = this.alwaysIN.update(
      position,
      this.lastViewModel?.state ?? 'OFF',
      dtSeconds * 1000
    );
    const ego = this.egoFrom(sample, pose);
    this.lastEgo = ego;
    for (const sink of this.egoSinks) {
      try {
        sink(ego);
      } catch (err) {
        console.error('[devshell] ego sink error', err);
      }
    }
  }

  private tick(dtMs: number): void {
    const dt = Math.max(1, Math.min(1000, dtMs));
    // Track dwell so an ACTIVE corridor can be reported as HOLD.
    const speed = this.provider.getLastSample()?.speedMps ?? 0;
    this.stoppedFor = speed < 0.5 ? this.stoppedFor + dt / 1000 : 0;

    try {
      this.lastViewModel = this.core.tick(dt);
    } catch (err) {
      // A simulation fault must never take the app down with it.
      console.error('[devshell] core tick failed', err);
    }
  }

  /**
   * Map the engine's four-state Always-IN onto DevShell's five.
   *
   * The shared engine has no HOLD state and is deliberately not being given
   * one — that would change live product behaviour. DevShell derives it:
   * ACTIVE plus a sustained stop is a hold at a junction.
   */
  private deriveINState(): DevShellINState {
    const state = this.lastViewModel?.state ?? 'OFF';
    if (state === 'ACTIVE' && this.stoppedFor >= HOLD_DWELL_SECONDS) return 'HOLD';
    return state;
  }

  private egoFrom(sample: DevShellSample, pose: EgoPose): DevShellEgo {
    return {
      location: { lng: sample.position.lng, lat: sample.position.lat },
      z: pose.z,
      headingDeg: sample.headingDeg,
      speedMps: sample.speedMps,
      verticalRateMps: pose.verticalRateMps,
      floorLevel: sample.floorLevel,
      verticalMotionState: sample.verticalMotionState,
      timestampMs: sample.timestampMs
    };
  }

  /** Corridor + junctions from the simulation, for the Always-IN engine. */
  private buildCorridor(): [CorridorSegment[], JunctionNode[]] {
    const loop = this.simulation.corridor();
    const segments: CorridorSegment[] = [];
    const junctions: JunctionNode[] = [];

    for (let i = 0; i < loop.length - 1; i++) {
      const a = loop[i];
      const b = loop[i + 1];
      segments.push({
        id: `devshell-seg-${i}`,
        name: `${this.simulation.name} leg ${i + 1}`,
        path: [
          { lat: a[1], lng: a[0] },
          { lat: b[1], lng: b[0] }
        ],
        speedLimitMps: 13.4
      });
      if (i > 0) {
        junctions.push({
          id: `devshell-jct-${i}`,
          kind: 'turn',
          position: { lat: a[1], lng: a[0] }
        });
      }
    }
    // No terminal node: DevShell corridors are loops, so Always-IN cycles
    // rather than arriving and shutting down.
    return [segments, junctions];
  }
}
