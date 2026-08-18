// engine/4d/rushHour.ts
//
// Rush-hour model for the 4D temporal engine. Pure function of local time +
// day-of-week — a cheap prior the engine blends with live traffic so routing
// degrades gracefully when the live feed is stale or missing.

export interface RushProfile {
  /** Local hour 0..23 → expected congestion factor 0..1 (1 = gridlock prior). */
  weekday: number[];
  weekend: number[];
}

/** A typical urban bimodal weekday curve (AM + PM peaks). */
export const DEFAULT_RUSH: RushProfile = {
  weekday: [
    0.05, 0.03, 0.02, 0.02, 0.05, 0.15, 0.4, 0.75, 0.9, 0.65, 0.4, 0.35, 0.4,
    0.4, 0.45, 0.55, 0.7, 0.9, 0.85, 0.6, 0.4, 0.25, 0.15, 0.08
  ],
  weekend: [
    0.05, 0.04, 0.03, 0.02, 0.02, 0.03, 0.06, 0.1, 0.2, 0.35, 0.45, 0.5, 0.5,
    0.5, 0.5, 0.5, 0.45, 0.45, 0.4, 0.35, 0.3, 0.25, 0.18, 0.1
  ]
};

/** Rush-hour congestion prior for a wall-clock instant, 0..1. */
export function rushFactor(epochMs: number, profile: RushProfile = DEFAULT_RUSH): number {
  const d = new Date(epochMs);
  const day = d.getDay();
  const isWeekend = day === 0 || day === 6;
  const curve = isWeekend ? profile.weekend : profile.weekday;
  const hour = d.getHours();
  const next = (hour + 1) % 24;
  const frac = d.getMinutes() / 60;
  // Linear interpolate between the hour buckets.
  return curve[hour] * (1 - frac) + curve[next] * frac;
}

export function isRushHour(epochMs: number, threshold = 0.7): boolean {
  return rushFactor(epochMs) >= threshold;
}
