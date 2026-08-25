/**
 * LiveStatePanel — SM's live telemetry readout, now indoor-aware.
 *
 * Shows the 3–7D state: position and accuracy, horizontal motion, floor and
 * vertical motion, and the Always-IN phase.
 */

import type { AlwaysINState } from '../../sm-core/ae/AlwaysIN';
import { verticalGuidance } from '../../sm-core/ae/AlwaysIN';
import type { SMPosition } from '../../sm-core/ae/Position';
import { positionQuality } from '../../sm-core/ae/Position';
import type { HorizontalMotionState } from '../../sm-core/ae/IMU';

export interface LiveStatePanelProps {
  position: SMPosition | null;
  motion: HorizontalMotionState;
  /** Confidence in the horizontal motion state, 0…1. */
  confidence: number;
  alwaysIN?: AlwaysINState | null;
  updateHz?: number;
}

/**
 * Label for the horizontal motion state.
 *
 * BUG FIX (panel reading "Driving" while stationary): the panel used to render
 * whatever state it was handed, so a stale or over-eager classification stayed
 * on screen indefinitely. It now cross-checks against measured speed: with a
 * real fix reporting under 0.7 m/s the panel will not say "Driving", and a
 * low-confidence state is shown as provisional rather than asserted. The
 * classifier fix lives in telemetry/IMU.ts; this is the display-side guard so
 * the two cannot disagree.
 */
export function motionLabel(
  motion: HorizontalMotionState,
  position: SMPosition | null,
  confidence: number
): string {
  const speed = position?.speedMps;
  const measuredStationary = typeof speed === 'number' && Number.isFinite(speed) && speed < 0.7;

  if (measuredStationary && (motion === 'driving' || motion === 'walking')) {
    return 'Stationary';
  }

  const base =
    motion === 'driving'
      ? 'Driving'
      : motion === 'walking'
        ? 'Walking'
        : motion === 'still'
          ? 'Stationary'
          : 'Unknown';

  // Below this, the state is a guess — say so rather than asserting it.
  return confidence < 0.4 && motion !== 'unknown' ? `${base}?` : base;
}

export function floorLabel(position: SMPosition | null): string {
  if (!position || position.floorLevel === null) return 'Outdoors';
  const level = position.floorLevel;
  const name = level === 0 ? 'Ground' : `Level ${level}`;
  return `${name}  ±${position.verticalAccuracyM.toFixed(1)} m`;
}

export function verticalLabel(position: SMPosition | null): string {
  if (!position) return '—';
  switch (position.verticalMotionState) {
    case 'stairs': return 'On stairs';
    case 'lift': return 'In lift';
    case 'escalator': return 'On escalator';
    case 'static':
    default: return 'Level';
  }
}

export default function LiveStatePanel({
  position,
  motion,
  confidence,
  alwaysIN,
  updateHz
}: LiveStatePanelProps) {
  const quality = position ? positionQuality(position) : 'degraded';
  const guidance = alwaysIN ? verticalGuidance(alwaysIN) : null;

  const rows: [string, string][] = [
    [
      'Position',
      position
        ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`
        : 'acquiring…'
    ],
    ['Accuracy', position ? `±${position.accuracyM.toFixed(0)} m (${quality})` : '—'],
    ['Motion', motionLabel(motion, position, confidence)],
    ['Confidence', `${Math.round(confidence * 100)}%`],
    ['Floor', floorLabel(position)],
    ['Vertical', verticalLabel(position)]
  ];
  if (alwaysIN) rows.push(['Always-IN', `${alwaysIN.corridor} / ${alwaysIN.vertical}`]);
  if (updateHz !== undefined) rows.push(['Update', `${updateHz.toFixed(1)} Hz`]);

  return (
    <section className="sm-live-state" aria-label="Live state">
      <h2 className="sm-live-state__title">Live state</h2>
      <dl className="sm-live-state__grid">
        {rows.map(([key, value]) => (
          <div className="sm-live-state__row" key={key}>
            <dt>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {guidance ? <p className="sm-live-state__guidance">{guidance}</p> : null}
    </section>
  );
}
