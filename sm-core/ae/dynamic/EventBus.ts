// sm-core/ae/dynamic/EventBus.ts
//
// Typed event bus for the SM logic layer. Deliberately separate from the app
// bus in src/engine — the logic layer emits its own event vocabulary
// (SMEventMap) and the app bridges the events it cares about.

type Handler<T> = (payload: T) => void;
export type Unsubscribe = () => void;

export class EventBus<Events extends object> {
  private listeners = new Map<keyof Events & string, Set<Handler<unknown>>>();

  on<K extends keyof Events & string>(event: K, handler: Handler<Events[K]>): Unsubscribe {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as Handler<unknown>);
    return () => {
      set.delete(handler as Handler<unknown>);
    };
  }

  /** Subscribe for a single delivery, then auto-unsubscribe. */
  once<K extends keyof Events & string>(event: K, handler: Handler<Events[K]>): Unsubscribe {
    const off = this.on(event, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  emit<K extends keyof Events & string>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    // Copy so handlers that unsubscribe mid-dispatch don't skip siblings.
    for (const fn of [...set]) {
      try {
        (fn as Handler<Events[K]>)(payload);
      } catch (err) {
        console.error(`[SM EventBus] handler error for "${event}"`, err);
      }
    }
  }

  listenerCount(event: keyof Events & string): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  clear(): void {
    this.listeners.clear();
  }
}
