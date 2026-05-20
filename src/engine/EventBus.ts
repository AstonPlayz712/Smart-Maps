type Handler<T> = (payload: T) => void;

export class EventBus<Events extends Record<string, unknown>> {
  private listeners: { [K in keyof Events]?: Set<Handler<Events[K]>> } = {};

  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    const set = this.listeners[event] ?? (this.listeners[event] = new Set());
    set.add(handler);
    return () => set.delete(handler);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.listeners[event]?.forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        console.error('[EventBus] handler error', err);
      }
    });
  }

  clear(): void {
    this.listeners = {};
  }
}
