/**
 * Indoor multi-floor journey — the DevShell scenario for indoor navigation.
 *
 * Walks the SM Atrium fixture venue: enter on the ground floor, take the
 * escalator to level 1, walk across, take the stairs to level 2, then ride the
 * lift back down to the ground floor. Floor sequence 0 → 1 → 2 → 1 → 0.
 *
 * Every vertical phase names the connector it uses, so DevShell emits real
 * `verticalMotionState` values (stairs / lift / escalator / static) rather than
 * inferring them.
 */

import type { IndoorJourneyScript } from '../types';

/** Matches public/maps/indoors/sm-atrium.json. */
const VENUE_ORIGIN = { lng: -0.1281, lat: 51.5071 };
const D = 0.0006;

const at = (dx: number, dy: number) => ({
  lng: VENUE_ORIGIN.lng + D * dx,
  lat: VENUE_ORIGIN.lat + D * dy
});

export const INDOOR_JOURNEY: IndoorJourneyScript = {
  id: 'sm-atrium-indoor',
  name: 'SM Atrium multi-floor walk',
  venueId: 'sm-atrium',
  floorHeightM: 4.2,
  /** Indoor pace — people walk slower inside than the outdoor default. */
  speedMps: 1.3,
  accuracyM: 8,
  verticalAccuracyM: 3,
  loop: true,
  phases: [
    // ── ground floor ──────────────────────────────────────────────────────
    { kind: 'walk',  floor: 0, from: at(-0.8, -0.8), to: at(0, 0.3),  seconds: 14 },
    { kind: 'dwell', floor: 0, at: at(0, 0.3), seconds: 3 },
    // ── up to level 1 on the escalator ────────────────────────────────────
    { kind: 'vertical', from: 0, to: 1, via: 'escalator', at: at(0, 0.3), seconds: 16 },
    { kind: 'walk',  floor: 1, from: at(0, 0.3), to: at(0.2, 0),   seconds: 10 },
    { kind: 'dwell', floor: 1, at: at(0.2, 0), seconds: 4 },
    // ── up to level 2 on the stairs ───────────────────────────────────────
    { kind: 'vertical', from: 1, to: 2, via: 'stairs', at: at(0.2, 0), seconds: 22 },
    { kind: 'walk',  floor: 2, from: at(0.2, 0), to: at(0.8, 0.8), seconds: 12 },
    { kind: 'dwell', floor: 2, at: at(0.8, 0.8), seconds: 5 },
    // ── back down: level 2 → 1 → 0 in the lift ────────────────────────────
    { kind: 'walk',  floor: 2, from: at(0.8, 0.8), to: at(-0.2, 0), seconds: 12 },
    { kind: 'vertical', from: 2, to: 1, via: 'lift', at: at(-0.2, 0), seconds: 14 },
    { kind: 'vertical', from: 1, to: 0, via: 'lift', at: at(-0.2, 0), seconds: 14 },
    { kind: 'walk',  floor: 0, from: at(-0.2, 0), to: at(-0.8, -0.8), seconds: 14 },
    { kind: 'dwell', floor: 0, at: at(-0.8, -0.8), seconds: 4 }
  ]
};
