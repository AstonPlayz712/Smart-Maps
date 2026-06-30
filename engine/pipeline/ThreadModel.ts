// engine/pipeline/ThreadModel.ts
//
// Threading model for the Dynamic Engine. Defines the lanes dimensional work
// runs on so the render loop stays clear. Maps onto the native ThreadPool in
// core/zante/native/threading.

import type { ThreadPool } from '../../core/zante/native/threading/ThreadPool';

/** Named scheduling lanes, ordered by latency budget. */
export enum Lane {
  /** Per-frame critical (camera, current-segment scoring). */
  Frame = 0,
  /** Interactive (route rescore on user action). */
  Interactive = 1,
  /** Streaming (mesh/terrain decode, road-graph build). */
  Streaming = 2,
  /** Background (familiarity learning, habit aggregation). */
  Background = 3
}

/**
 * Thin policy layer over the native ThreadPool that tags work with a Lane and
 * enforces which dimensions may run on which lane. 3D/4D run interactive-or-
 * faster; 5D/6D/7D learning runs background.
 */
export class ThreadModel {
  constructor(private readonly pool: ThreadPool) {}

  run<T>(lane: Lane, fn: () => T | Promise<T>): Promise<T> {
    return this.pool.run(lane, fn);
  }

  frame<T>(fn: () => T | Promise<T>): Promise<T> {
    return this.pool.run(Lane.Frame, fn);
  }

  background<T>(fn: () => T | Promise<T>): Promise<T> {
    return this.pool.run(Lane.Background, fn);
  }

  get backlog(): number {
    return this.pool.pending;
  }
}
