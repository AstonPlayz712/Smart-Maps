// sm-core/ae/dynamic/ContextManager.ts
//
// Learns and serves place context: which locations are Work, Home, or other
// labelled places, how often the user arrives there, and what place (if any)
// the current position corresponds to. ArrivalManager notifies it on every
// confirmed arrival; the rest of the app queries it.

import type { KnownPlace, Position } from './types';
import { haversineM } from './RouteManager';

const CLASSIFY_RADIUS_M = 75;

export class ContextManager {
  private places = new Map<string, KnownPlace>();
  private arrivalLog: { label: string; atMs: number }[] = [];

  /**
   * Record a confirmed arrival at a labelled place. First arrival creates the
   * place; repeats refine its position toward the observed arrival point
   * (running average) and bump the visit count.
   */
  markArrival(label: string, position: Position, atMs: number): KnownPlace {
    const key = normalizeLabel(label);
    const existing = this.places.get(key);
    if (existing) {
      // Running average pulls the stored position toward observed arrivals.
      const n = existing.visits + 1;
      existing.position = {
        lat: existing.position.lat + (position.lat - existing.position.lat) / n,
        lng: existing.position.lng + (position.lng - existing.position.lng) / n
      };
      existing.visits = n;
      existing.lastArrivalMs = atMs;
      this.arrivalLog.push({ label: existing.label, atMs });
      return existing;
    }
    const place: KnownPlace = {
      label,
      position: { lat: position.lat, lng: position.lng },
      visits: 1,
      firstSeenMs: atMs,
      lastArrivalMs: atMs
    };
    this.places.set(key, place);
    this.arrivalLog.push({ label, atMs });
    return place;
  }

  /** Pre-register a place (e.g. "Work" = 2 Springwood Drive) without a visit. */
  registerPlace(label: string, position: Position, atMs: number): KnownPlace {
    const key = normalizeLabel(label);
    const existing = this.places.get(key);
    if (existing) return existing;
    const place: KnownPlace = {
      label,
      position: { lat: position.lat, lng: position.lng },
      visits: 0,
      firstSeenMs: atMs,
      lastArrivalMs: 0
    };
    this.places.set(key, place);
    return place;
  }

  getPlace(label: string): KnownPlace | null {
    return this.places.get(normalizeLabel(label)) ?? null;
  }

  /** The known place the position is inside (nearest within radius), if any. */
  classify(position: Position, radiusM: number = CLASSIFY_RADIUS_M): KnownPlace | null {
    let best: KnownPlace | null = null;
    let bestD = Infinity;
    for (const place of this.places.values()) {
      const d = haversineM(position, place.position);
      if (d <= radiusM && d < bestD) {
        bestD = d;
        best = place;
      }
    }
    return best;
  }

  isAt(label: string, position: Position, radiusM: number = CLASSIFY_RADIUS_M): boolean {
    const place = this.getPlace(label);
    return place !== null && haversineM(position, place.position) <= radiusM;
  }

  allPlaces(): KnownPlace[] {
    return [...this.places.values()];
  }

  recentArrivals(limit = 20): { label: string; atMs: number }[] {
    return this.arrivalLog.slice(-limit);
  }

  reset(): void {
    this.places.clear();
    this.arrivalLog = [];
  }
}

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}
