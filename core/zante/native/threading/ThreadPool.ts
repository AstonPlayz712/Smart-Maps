// core/zante/native/threading/ThreadPool.ts
//
// Native threading model. The Z Build ran everything on the JS main thread
// (and a WebView render thread it didn't control). A/E owns its own worker
// pool so asset decode, road-graph build, and dimensional pipelines run off
// the render loop. In the browser harness this maps to Web Workers; on device
// it maps to the native std::thread pool in devshell/native.

export type Priority = number; // lower = sooner

interface QueuedJob<T> {
  priority: Priority;
  fn: () => T | Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}

/**
 * Priority work queue with a fixed concurrency limit. Jobs are plain thunks;
 * the device backend dispatches them to OS threads. The reference impl runs
 * them on the microtask queue but honours the concurrency cap so call sites
 * behave identically whether or not real threads exist underneath.
 */
export class ThreadPool {
  private queue: QueuedJob<unknown>[] = [];
  private active = 0;

  constructor(public readonly concurrency = 4) {}

  run<T>(priority: Priority, fn: () => T | Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ priority, fn, resolve, reject } as QueuedJob<unknown>);
      this.queue.sort((a, b) => a.priority - b.priority);
      this.pump();
    });
  }

  /** Run on the highest-priority lane — for per-frame critical work. */
  immediate<T>(fn: () => T | Promise<T>): Promise<T> {
    return this.run(-1, fn);
  }

  private pump(): void {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.active++;
      Promise.resolve()
        .then(job.fn)
        .then(
          (v) => {
            this.active--;
            job.resolve(v);
            this.pump();
          },
          (e) => {
            this.active--;
            job.reject(e);
            this.pump();
          }
        );
    }
  }

  get pending(): number {
    return this.queue.length;
  }
}
