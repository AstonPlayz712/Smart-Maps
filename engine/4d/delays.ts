// engine/4d/delays.ts
//
// Incident / delay model for the 4D temporal engine. Discrete, time-boxed
// events (roadworks, accidents, closures) that override the smooth traffic +
// rush priors on the segments they touch.

export type DelayKind = 'roadworks' | 'accident' | 'closure' | 'event' | 'breakdown';

export interface DelayEvent {
  id: string;
  kind: DelayKind;
  /** Affected road segment ids. */
  segmentIds: string[];
  /** Added travel time, seconds (Infinity for a hard closure). */
  addedSeconds: number;
  startsMs: number;
  endsMs: number;
}

export class DelayModel {
  private events: DelayEvent[] = [];

  add(event: DelayEvent): void {
    this.events.push(event);
  }

  /** Events active at `epochMs` touching `segmentId`. */
  activeFor(segmentId: string, epochMs: number): DelayEvent[] {
    return this.events.filter(
      (e) =>
        e.segmentIds.includes(segmentId) && epochMs >= e.startsMs && epochMs <= e.endsMs
    );
  }

  /** Total added seconds for a segment right now (Infinity = impassable). */
  delaySeconds(segmentId: string, epochMs: number): number {
    let total = 0;
    for (const e of this.activeFor(segmentId, epochMs)) {
      if (!Number.isFinite(e.addedSeconds)) return Infinity;
      total += e.addedSeconds;
    }
    return total;
  }

  prune(epochMs: number): void {
    this.events = this.events.filter((e) => e.endsMs >= epochMs);
  }
}
