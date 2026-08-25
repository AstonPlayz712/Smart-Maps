/**
 * Where the web shell's samples come from.
 *
 * Two sources, one shape. The engine never learns which it got:
 *
 *   hardware   `navigator.geolocation` + `devicemotion`, on a device that has
 *              them and a user who granted them.
 *   simulated  the DevShell simulation, on a desktop browser, a denied
 *              permission, or any host with no sensors at all.
 *
 * The fallback is not a degraded mode — it is a different sample source
 * feeding the same `updatePosition(gnss, imu)` call. Feed either source's
 * trace to the mobile shell and it produces the same state.
 */

import type { GnssSample, ImuSample } from 'sm-core';
import { createSimulation, resolveDevShellConfig, SimulatedLocationProvider } from '../devshell/src';

export type SampleListener = (gnss: GnssSample, imu: ImuSample) => void;

export interface SampleSource {
  /** 'hardware' or the name of the simulation standing in for it. */
  readonly name: string;
  readonly simulated: boolean;
  start(listener: SampleListener): void;
  stop(): void;
}

/** Where a simulated session starts when nothing better is known. */
const DEFAULT_ORIGIN = { lng: -0.1281, lat: 51.5071 };

/**
 * Pick a source for this host.
 *
 * `navigator.geolocation` existing is not proof it works — a desktop browser
 * offers it and then never fires, or the user denies it. So the hardware
 * source watches for its own first fix and hands over to the simulation if one
 * does not arrive; the shell is never left with nothing to draw, and never
 * waits on a permission dialog that may never be answered.
 */
export function createSampleSource(): SampleSource {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return simulatedSource();
  }
  return hardwareSource();
}

export function simulatedSource(origin = DEFAULT_ORIGIN): SampleSource {
  const config = resolveDevShellConfig();
  const provider = new SimulatedLocationProvider(
    createSimulation(origin, config),
    config.updateRateHz
  );

  return {
    name: provider.simulation.name,
    simulated: true,
    start(listener) {
      provider.onSample((sample) => {
        listener(
          {
            lat: sample.position.lat,
            lng: sample.position.lng,
            accuracyM: sample.accuracyM,
            headingDeg: sample.headingDeg,
            speedMps: sample.speedMps,
            altitudeM: sample.altitudeM,
            verticalAccuracyM: sample.verticalAccuracyM,
            timestampMs: sample.timestampMs,
            simulated: true
          },
          provider.imu()
        );
      });
      // Emits its first sample synchronously, so the first frame has a centre.
      provider.start();
    },
    stop() {
      provider.stop();
    }
  };
}

/**
 * How long to wait for a first real fix before handing over to the simulation.
 *
 * Short on purpose. A warm receiver answers well inside this, and anything
 * slower is indistinguishable from a browser that is never going to answer at
 * all — which is most desktops. Waiting longer only buys a blank map.
 */
const FIRST_FIX_GRACE_MS = 1500;

function hardwareSource(): SampleSource {
  let watchId: number | null = null;
  let fallback: SampleSource | null = null;
  let graceTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  // The IMU is optional — plenty of browsers expose no motion events. A still
  // sample is the honest stand-in: it claims no motion rather than inventing
  // some, and the engine is built to run on GNSS alone.
  let imu: ImuSample = { accelMagnitude: 0, verticalAccel: 0, gyroMagnitude: 0, timestampMs: Date.now() };
  const onMotion = (event: DeviceMotionEvent) => {
    const a = event.acceleration ?? event.accelerationIncludingGravity;
    const r = event.rotationRate;
    imu = {
      accelMagnitude: a ? Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0) : 0,
      verticalAccel: a?.z ?? 0,
      gyroMagnitude: r ? toRadians(Math.hypot(r.alpha ?? 0, r.beta ?? 0, r.gamma ?? 0)) : 0,
      timestampMs: Date.now()
    };
  };

  const clearGrace = () => {
    if (graceTimer !== null) {
      clearTimeout(graceTimer);
      graceTimer = null;
    }
  };

  return {
    name: 'hardware',
    simulated: false,
    start(listener) {
      window.addEventListener('devicemotion', onMotion);

      const useFallback = () => {
        clearGrace();
        if (stopped || fallback) return;
        fallback = simulatedSource();
        fallback.start(listener);
      };

      graceTimer = setTimeout(useFallback, FIRST_FIX_GRACE_MS);

      // A permission already refused is a definite answer, so there is no
      // reason to sit out the grace period waiting for a fix that cannot come.
      void permissionState().then((state) => {
        if (state === 'denied') useFallback();
      });

      watchId = navigator.geolocation.watchPosition(
        (fix) => {
          clearGrace();
          // A real fix arrived after the handover: the simulation stops and
          // hardware takes over, rather than the two fighting over the map.
          if (fallback) {
            fallback.stop();
            fallback = null;
          }
          listener(toGnssSample(fix), imu);
        },
        () => useFallback(),
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 15_000 }
      );
    },
    stop() {
      stopped = true;
      clearGrace();
      window.removeEventListener('devicemotion', onMotion);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      fallback?.stop();
    }
  };
}

/** The geolocation permission, when the browser will tell us. */
async function permissionState(): Promise<PermissionState | 'unknown'> {
  try {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown';
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return status.state;
  } catch {
    // Some browsers reject the geolocation descriptor outright — not knowing
    // is fine, the grace period covers it.
    return 'unknown';
  }
}

function toGnssSample(fix: GeolocationPosition): GnssSample {
  const c = fix.coords;
  return {
    lat: c.latitude,
    lng: c.longitude,
    accuracyM: c.accuracy,
    headingDeg: c.heading,
    speedMps: c.speed,
    altitudeM: c.altitude,
    verticalAccuracyM: c.altitudeAccuracy,
    timestampMs: fix.timestamp
  };
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}
