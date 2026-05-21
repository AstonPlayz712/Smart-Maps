import { BaseTransport, type TransportId } from './Transport';

const DEFAULT_URL = 'ws://localhost:8765';
const CONNECT_TIMEOUT_MS = 1500;

/**
 * Local WebSocket transport — the dev / fallback path. Connects to a JSON
 * relay on `ws://localhost:8765` (override via constructor). Useful for
 * running an AutoOSM simulator on the same machine while iterating on
 * Smart Maps OS.
 *
 * Availability check is cheap (`WebSocket` exists); the real test is the
 * connect, which fails fast (~1.5 s timeout) when no server is running so the
 * bridge can move on or surface "disconnected" in the UI.
 */
export class LocalWebSocketTransport extends BaseTransport {
  readonly id: TransportId = 'websocket';
  readonly name = 'Local WebSocket';

  private ws: WebSocket | null = null;
  private url: string;

  constructor(url: string = DEFAULT_URL) {
    super();
    this.url = url;
  }

  isAvailable(): boolean {
    return typeof WebSocket !== 'undefined';
  }

  async connect(): Promise<void> {
    if (this.status === 'connected') return;
    this.status = 'connecting';

    await new Promise<void>((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(this.url);
      } catch (err) {
        this.status = 'failed';
        reject(err);
        return;
      }

      const timer = window.setTimeout(() => {
        try {
          ws.close();
        } catch {
          /* noop */
        }
        this.status = 'failed';
        reject(new Error(`WebSocket connect timeout (${this.url})`));
      }, CONNECT_TIMEOUT_MS);

      ws.onopen = () => {
        window.clearTimeout(timer);
        this.ws = ws;
        this.status = 'connected';
        ws.onmessage = (ev) => {
          const data = typeof ev.data === 'string' ? ev.data : '';
          const msg = this.decode(data);
          if (msg) this.dispatchMessage(msg);
        };
        ws.onclose = () => {
          this.status = 'disconnected';
          this.ws = null;
        };
        ws.onerror = (err) => {
          console.warn(`[transport:${this.id}] error`, err);
        };
        resolve();
      };

      ws.onerror = () => {
        window.clearTimeout(timer);
        this.status = 'failed';
        reject(new Error(`WebSocket connect failed (${this.url})`));
      };
    });
  }

  disconnect(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* noop */
      }
    }
    this.ws = null;
    this.status = 'disconnected';
  }

  send(event: string, payload: unknown): void {
    if (this.status !== 'connected' || !this.ws) return;
    try {
      this.ws.send(this.encode(event, payload));
    } catch (err) {
      console.warn(`[transport:${this.id}] send failed`, err);
    }
  }
}
