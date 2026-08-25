/**
 * The built-in sample journey used by `mode: 'path'`.
 *
 * A short central-London drive: set off, run east, pause at a junction, turn
 * north, then arrive. It carries all three timelines a journey can define —
 * GNSS path, motion sequence, and an Always-IN timeline that walks the full
 * OFF → PREP → ACTIVE → HOLD → EXIT cycle — so path playback exercises every
 * scripted behaviour out of the box.
 *
 * Copy this file to add your own journeys.
 */

import type { JourneyScript } from '../types';

export const SAMPLE_JOURNEY: JourneyScript = {
  id: 'london-sample',
  name: 'Central London sample drive',
  speedMps: 11,
  accuracyM: 5,
  loop: true,
  path: [
    { lat: 51.5074, lng: -0.1278, accuracyM: 4 },
    { lat: 51.5074, lng: -0.1240, accuracyM: 5 },
    // A signalled junction — dwell here, which is what puts Always-IN in HOLD.
    { lat: 51.5074, lng: -0.1205, accuracyM: 6, holdSeconds: 6 },
    { lat: 51.5100, lng: -0.1205, accuracyM: 5, speedMps: 9 },
    { lat: 51.5128, lng: -0.1205, accuracyM: 7 },
    { lat: 51.5128, lng: -0.1250, accuracyM: 6, speedMps: 8 },
    { lat: 51.5074, lng: -0.1278, accuracyM: 4 }
  ],
  motionSequence: [
    { state: 'driving', seconds: 12 },
    { state: 'walking', seconds: 3 },
    { state: 'still', seconds: 6 },
    { state: 'driving', seconds: 20 }
  ],
  inTimeline: [
    { state: 'OFF', seconds: 2 },
    { state: 'PREP', seconds: 6 },
    { state: 'ACTIVE', seconds: 10 },
    { state: 'HOLD', seconds: 6 },
    { state: 'ACTIVE', seconds: 8 },
    { state: 'EXIT', seconds: 4 }
  ]
};
