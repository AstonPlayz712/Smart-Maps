/**
 * IndoorLayer — indoor floor plans and multi-floor transitions.
 *
 * Owns which venue is active, which floor is displayed, and the geometry for
 * that floor. It is the only place floor state lives, so the renderer, the
 * router and the telemetry pipeline all agree on "which floor am I on".
 */

import type { TileSource } from '../tiles/TileSource';
import type { IndoorConnector, IndoorFloor, IndoorVenue, LngLat } from '../tiles/types';

export interface FloorChange {
  venueId: string;
  from: number | null;
  to: number;
  /** Set when the change came from walking a connector rather than a jump. */
  via?: IndoorConnector;
}

export type IndoorListener = (state: IndoorLayerState) => void;

export interface IndoorLayerState {
  venue: IndoorVenue | null;
  floor: IndoorFloor | null;
  floorLevel: number | null;
  /** Ascending list of levels the active venue provides. */
  availableFloors: number[];
  /** True while a floor transition animation is in flight. */
  transitioning: boolean;
}

/** Seconds a floor-to-floor cross-fade runs for. */
const TRANSITION_MS = 320;

export class IndoorLayer {
  private venue: IndoorVenue | null = null;
  private floorLevel: number | null = null;
  private transitioning = false;
  private transitionTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<IndoorListener>();
  /** Guards against a stale venue load overwriting a newer one. */
  private loadToken = 0;

  constructor(private readonly tiles: TileSource) {}

  // ─── venue ────────────────────────────────────────────────────────────────

  async enterVenue(venueId: string, initialFloor?: number): Promise<boolean> {
    const token = ++this.loadToken;
    const venue = await this.tiles.venue(venueId);
    if (token !== this.loadToken) return false; // superseded by a newer call
    if (!venue || venue.floors.length === 0) {
      console.warn(`[IndoorLayer] venue "${venueId}" has no floors`);
      return false;
    }

    this.venue = venue;
    const levels = this.levels();
    const target =
      initialFloor !== undefined && levels.includes(initialFloor)
        ? initialFloor
        : levels.includes(0)
          ? 0
          : levels[0];
    this.floorLevel = target;
    this.emit();
    return true;
  }

  exitVenue(): void {
    this.loadToken++;
    this.venue = null;
    this.floorLevel = null;
    this.clearTransition();
    this.emit();
  }

  // ─── floors ───────────────────────────────────────────────────────────────

  /**
   * Change the displayed floor.
   *
   * BUG FIX (indoor layer not updating when floorLevel changes): the previous
   * flow stored the new level but only redrew when the venue itself changed,
   * so walking upstairs left the old floor on screen. Now every accepted
   * change emits to listeners — the renderer subscribes and reloads geometry
   * off that event, so display and state cannot diverge.
   */
  setFloor(level: number, via?: IndoorConnector): boolean {
    if (!this.venue) return false;
    if (!this.levels().includes(level)) {
      console.warn(`[IndoorLayer] floor ${level} not in venue ${this.venue.venueId}`);
      return false;
    }
    if (level === this.floorLevel) return true;

    const from = this.floorLevel;
    this.floorLevel = level;

    // Cross-fade so a floor change reads as a transition rather than a cut.
    this.clearTransition();
    this.transitioning = true;
    this.transitionTimer = setTimeout(() => {
      this.transitioning = false;
      this.transitionTimer = null;
      this.emit();
    }, TRANSITION_MS);

    this.emit();
    this.floorChangeListeners.forEach((cb) => {
      try {
        cb({ venueId: this.venue!.venueId, from, to: level, via });
      } catch (err) {
        console.error('[IndoorLayer] floor change listener error', err);
      }
    });
    return true;
  }

  /**
   * Follow the telemetry's floor estimate. Ignores levels the venue doesn't
   * have, so a noisy estimate can't blank the display.
   */
  syncToTelemetry(floorLevel: number | null): void {
    if (floorLevel === null || !this.venue) return;
    const rounded = Math.round(floorLevel);
    if (this.levels().includes(rounded)) this.setFloor(rounded);
  }

  /**
   * The clipping rule for every floor-tagged feature.
   *
   * Centralised deliberately: each layer used to compare floor levels itself,
   * and any layer that forgot leaked another floor's geometry onto the current
   * one. Outdoor features (no floorLevel) always pass; indoor features pass
   * only on the active floor, and none pass when no venue is active.
   */
  isOnActiveFloor(floorLevel?: number | null): boolean {
    if (floorLevel === undefined || floorLevel === null) return true; // outdoor
    if (this.floorLevel === null) return false; // indoor feature, not in a venue
    return floorLevel === this.floorLevel;
  }

  currentFloor(): IndoorFloor | null {
    if (!this.venue || this.floorLevel === null) return null;
    return this.venue.floors.find((f) => f.level === this.floorLevel) ?? null;
  }

  currentLevel(): number | null {
    return this.floorLevel;
  }

  currentVenue(): IndoorVenue | null {
    return this.venue;
  }

  levels(): number[] {
    return (this.venue?.floors ?? []).map((f) => f.level).sort((a, b) => a - b);
  }

  connectors(): IndoorConnector[] {
    return this.venue?.connectors ?? [];
  }

  /** Elevation of the active floor's walking surface, metres above ground. */
  currentElevationM(): number {
    return this.currentFloor()?.elevationM ?? 0;
  }

  /** Nearest connector serving both floors — what routing steps through. */
  connectorBetween(from: number, to: number, near?: LngLat): IndoorConnector | null {
    const candidates = this.connectors().filter(
      (c) => c.floors.includes(from) && c.floors.includes(to)
    );
    if (candidates.length === 0) return null;
    if (!near) return candidates[0];
    return candidates.reduce((best, c) =>
      squaredDistance(c.position, near) < squaredDistance(best.position, near) ? c : best
    );
  }

  state(): IndoorLayerState {
    return {
      venue: this.venue,
      floor: this.currentFloor(),
      floorLevel: this.floorLevel,
      availableFloors: this.levels(),
      transitioning: this.transitioning
    };
  }

  // ─── subscriptions ────────────────────────────────────────────────────────

  private floorChangeListeners = new Set<(change: FloorChange) => void>();

  onChange(cb: IndoorListener): () => void {
    this.listeners.add(cb);
    cb(this.state());
    return () => {
      this.listeners.delete(cb);
    };
  }

  onFloorChange(cb: (change: FloorChange) => void): () => void {
    this.floorChangeListeners.add(cb);
    return () => {
      this.floorChangeListeners.delete(cb);
    };
  }

  dispose(): void {
    this.clearTransition();
    this.listeners.clear();
    this.floorChangeListeners.clear();
  }

  private clearTransition(): void {
    if (this.transitionTimer !== null) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }
    this.transitioning = false;
  }

  private emit(): void {
    const snapshot = this.state();
    this.listeners.forEach((cb) => {
      try {
        cb(snapshot);
      } catch (err) {
        console.error('[IndoorLayer] listener error', err);
      }
    });
  }
}

function squaredDistance(a: LngLat, b: LngLat): number {
  const dx = a.lng - b.lng;
  const dy = a.lat - b.lat;
  return dx * dx + dy * dy;
}
