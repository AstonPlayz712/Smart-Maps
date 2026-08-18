/**
 * DevShellRuntime — the replacement wiring for SM's hardware-backed engines
 * when no native core is present.
 *
 * On a native host these feeds come from GNSS + CoreMotion/SensorManager and
 * drive dead reckoning, Always-IN and the Dynamic Engine. In DevShell every one
 * of those inputs is served by `SimulatedSensorFeed` instead:
 *
 *   simulated GNSS  → LocationProviders (via SimulatedLocationProvider)
 *   simulated GNSS  → SMCore.pushGnss     (position / DR / Always-IN)
 *   simulated IMU   → SMCore.pushImu      (motion confidence / DR)
 *   simulated pose  → Dynamic Engine ego  (3D…7D pipeline)
 *
 * The runtime also seeds SMCore with a corridor built from the simulated loop,
 * so the Always-IN state machine actually runs (OFF → PREP → ACTIVE) rather
 * than idling for want of a route.
 *
 * Everything resolves synchronously on `start()` — first fix, first tick and
 * first ego state are all available before the call returns, which is what
 * keeps the boot pipeline from hanging on a lock that never arrives.
 */

import { SMCore } from '../../src/logic/SMCore';
import type { CorridorSegment, INViewModel, JunctionNode } from '../../src/logic/types';
import { SimulatedLocationProvider } from './SimulatedLocationProvider';
import { buildLoop } from './SimulatedRoute';
import type { DevShellOptions, DevShellPosition, DevShellSample } from './types';

export interface DevShellEgo {
  location: { lng: number; lat: number };
  headingDeg: number;
  speedMps: number;
}

export interface DevShellStatus {
  active: true;
  sample: DevShellSample | null;
  inState: INViewModel['state'] | 'OFF';
  updateRateHz: number;
}

export class DevShellRuntime {
  readonly provider: SimulatedLocationProvider;
  readonly core: SMCore;

  private readonly loop: [number, number][];
  private readonly tickMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTickAt = 0;
  private lastViewModel: INViewModel | null = null;
  private egoSinks = new Set<(ego: DevShellEgo) => void>();
  private started = false;

  constructor(origin: DevShellPosition, opts: DevShellOptions = {}) {
    this.loop = opts.route ?? buildLoop(origin);
    this.provider = new SimulatedLocationProvider(origin, { ...opts, route: this.loop });
    this.core = new SMCore();
    this.tickMs = 1000 / (opts.updateRateHz ?? 10);
  }

  // ─── lifecycle ────────────────────────────────────────────────────────────

  start(): void {
    if (this.started) return;
    this.started = true;

    this.core.init();
    this.core.setRoute(...this.buildCorridor());

    // Starting the provider publishes the first simulated fix synchronously.
    this.provider.start();

    // Feed every simulated fix into the A/E logic layer exactly as the native
    // sensor hub would.
    this.provider.onSample((sample) => this.ingest(sample));

    this.lastTickAt = Date.now();
    // Run one tick immediately so Always-IN and the ego state are populated
    // before start() returns — nothing downstream has to wait.
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
  }

  // ─── consumers ────────────────────────────────────────────────────────────

  /** Route simulated ego states into the Dynamic Engine (or anything else). */
  onEgo(sink: (ego: DevShellEgo) => void): () => void {
    this.egoSinks.add(sink);
    const sample = this.provider.getLastSample();
    if (sample) sink(this.egoFrom(sample));
    return () => {
      this.egoSinks.delete(sink);
    };
  }

  status(): DevShellStatus {
    return {
      active: true,
      sample: this.provider.getLastSample(),
      inState: this.lastViewModel?.state ?? 'OFF',
      updateRateHz: this.provider.getLastSample()?.updateRateHz ?? 0
    };
  }

  getINViewModel(): INViewModel | null {
    return this.lastViewModel;
  }

  // ─── internals ────────────────────────────────────────────────────────────

  private ingest(sample: DevShellSample): void {
    // GNSS — the same shape CoreLocation/LocationManager would deliver.
    this.core.pushGnss({
      position: { lat: sample.position.lat, lng: sample.position.lng },
      speedMps: sample.speedMps,
      headingDeg: sample.headingDeg,
      accuracyM: sample.accuracyM,
      timestampMs: sample.timestampMs
    });
    // IMU — drives motion confidence and dead reckoning.
    const imu = this.provider.imu();
    this.core.pushImu(imu);
    this.core.pushCompassHeading(sample.headingDeg, sample.timestampMs);

    for (const sink of this.egoSinks) {
      try {
        sink(this.egoFrom(sample));
      } catch (err) {
        console.error('[devshell] ego sink error', err);
      }
    }
  }

  private tick(dtMs: number): void {
    try {
      this.lastViewModel = this.core.tick(Math.max(1, Math.min(1000, dtMs)));
    } catch (err) {
      // A simulation fault must never take the app down with it.
      console.error('[devshell] core tick failed', err);
    }
  }

  private egoFrom(sample: DevShellSample): DevShellEgo {
    return {
      location: { lng: sample.position.lng, lat: sample.position.lat },
      headingDeg: sample.headingDeg,
      speedMps: sample.speedMps
    };
  }

  /** Corridor + junctions built from the simulated loop, for Always-IN. */
  private buildCorridor(): [CorridorSegment[], JunctionNode[]] {
    const segments: CorridorSegment[] = [];
    const junctions: JunctionNode[] = [];

    for (let i = 0; i < this.loop.length - 1; i++) {
      const a = this.loop[i];
      const b = this.loop[i + 1];
      segments.push({
        id: `devshell-seg-${i}`,
        name: `DevShell leg ${i + 1}`,
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
    // No terminal node: the loop is endless, so Always-IN cycles
    // OFF → PREP → ACTIVE instead of arriving and shutting down.
    return [segments, junctions];
  }
}
