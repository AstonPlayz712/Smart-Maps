export type TransportId = 'wifi-direct' | 'bluetooth-le' | 'websocket';

export type TransportStatus = 'disconnected' | 'connecting' | 'connected' | 'failed';

export interface TransportMessage {
  event: string;
  payload: unknown;
}

export type TransportMessageHandler = (msg: TransportMessage) => void;
export type Unsubscribe = () => void;

/**
 * Shared transport contract for the AutoEx bridge. Each transport plug — Wi-Fi
 * Direct, Bluetooth LE, local WebSocket — implements this so AutoExBridge can
 * try them in priority order without knowing the wire details.
 */
export interface Transport {
  readonly id: TransportId;
  readonly name: string;

  isAvailable(): Promise<boolean> | boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void> | void;
  send(event: string, payload: unknown): void;
  onMessage(cb: TransportMessageHandler): Unsubscribe;
  getStatus(): TransportStatus;
}

/** Reusable base — handles subscriber bookkeeping so each transport is leaner. */
export abstract class BaseTransport implements Transport {
  abstract readonly id: TransportId;
  abstract readonly name: string;

  protected status: TransportStatus = 'disconnected';
  private handlers = new Set<TransportMessageHandler>();

  abstract isAvailable(): Promise<boolean> | boolean;
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void> | void;
  abstract send(event: string, payload: unknown): void;

  onMessage(cb: TransportMessageHandler): Unsubscribe {
    this.handlers.add(cb);
    return () => {
      this.handlers.delete(cb);
    };
  }

  getStatus(): TransportStatus {
    return this.status;
  }

  protected dispatchMessage(msg: TransportMessage): void {
    this.handlers.forEach((h) => {
      try {
        h(msg);
      } catch (err) {
        console.error(`[transport:${this.id}] handler error`, err);
      }
    });
  }

  protected encode(event: string, payload: unknown): string {
    return JSON.stringify({ event, payload });
  }

  protected decode(raw: string): TransportMessage | null {
    try {
      const obj = JSON.parse(raw);
      if (typeof obj?.event === 'string') {
        return { event: obj.event, payload: obj.payload };
      }
      return null;
    } catch {
      return null;
    }
  }
}
