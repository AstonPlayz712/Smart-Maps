import { BaseTransport, type TransportId } from './Transport';

/**
 * AutoEx service / characteristic UUIDs. 128-bit random IDs reserved for the
 * Smart Maps OS ↔ AutoOSM protocol. The companion device advertises the
 * service UUID; this transport opens a write characteristic for outbound
 * packets and subscribes to a notify characteristic for inbound packets.
 */
const AUTOEX_SERVICE_UUID = 'f3a01c00-9f7e-4e1f-a3a0-1b3a9c000001';
const AUTOEX_TX_CHAR_UUID = 'f3a01c01-9f7e-4e1f-a3a0-1b3a9c000001';
const AUTOEX_RX_CHAR_UUID = 'f3a01c02-9f7e-4e1f-a3a0-1b3a9c000001';

const RECONNECT_BACKOFF_MS = [1000, 2000, 4000];
const MAX_PACKET_BYTES = 512;

/**
 * Bluetooth LE transport. Uses Web Bluetooth to connect to a device
 * advertising the AutoEx service UUID. Reads notifications and writes small
 * JSON packets; auto-reconnects (1 s → 2 s → 4 s) on GATT disconnect.
 *
 * Web Bluetooth requires a user gesture for `requestDevice`, so the bridge's
 * `connect()` must be triggered from a click. The diagnostics overlay's
 * "connect" button satisfies that.
 */
export class BluetoothLETransport extends BaseTransport {
  readonly id: TransportId = 'bluetooth-le';
  readonly name = 'Bluetooth LE';

  private device: BluetoothDevice | null = null;
  private tx: BluetoothRemoteGATTCharacteristic | null = null;
  private rx: BluetoothRemoteGATTCharacteristic | null = null;
  private reconnectAttempts = 0;
  private deliberateDisconnect = false;
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();

  isAvailable(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  async connect(): Promise<void> {
    if (this.status === 'connected') return;
    if (!this.isAvailable()) throw new Error('Web Bluetooth unavailable');

    this.status = 'connecting';
    this.deliberateDisconnect = false;

    try {
      if (!this.device) {
        this.device = await navigator.bluetooth!.requestDevice({
          filters: [{ services: [AUTOEX_SERVICE_UUID] }],
          optionalServices: [AUTOEX_SERVICE_UUID]
        });
        this.device.addEventListener('gattserverdisconnected', this.handleDisconnect);
      }
      await this.gattConnect();
      this.reconnectAttempts = 0;
      this.status = 'connected';
    } catch (err) {
      this.status = 'failed';
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.deliberateDisconnect = true;
    try {
      if (this.rx) await this.rx.stopNotifications().catch(() => undefined);
    } catch {
      /* noop */
    }
    this.rx?.removeEventListener('characteristicvaluechanged', this.handleNotification);
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    this.tx = null;
    this.rx = null;
    this.status = 'disconnected';
  }

  send(event: string, payload: unknown): void {
    if (this.status !== 'connected' || !this.tx) return;
    const raw = this.encoder.encode(this.encode(event, payload));
    if (raw.byteLength > MAX_PACKET_BYTES) {
      console.warn(`[transport:${this.id}] packet ${raw.byteLength}B exceeds MTU; dropping`);
      return;
    }
    this.tx.writeValueWithoutResponse(raw).catch((err: unknown) => {
      console.warn(`[transport:${this.id}] write failed`, err);
    });
  }

  private async gattConnect(): Promise<void> {
    if (!this.device?.gatt) throw new Error('No GATT server');
    const server = await this.device.gatt.connect();
    const service = await server.getPrimaryService(AUTOEX_SERVICE_UUID);
    this.tx = await service.getCharacteristic(AUTOEX_TX_CHAR_UUID);
    this.rx = await service.getCharacteristic(AUTOEX_RX_CHAR_UUID);
    await this.rx.startNotifications();
    this.rx.addEventListener('characteristicvaluechanged', this.handleNotification);
  }

  private handleNotification = (e: Event): void => {
    const target = e.target as BluetoothRemoteGATTCharacteristic;
    const view = target.value;
    if (!view) return;
    const raw = this.decoder.decode(view);
    const msg = this.decode(raw);
    if (msg) this.dispatchMessage(msg);
  };

  private handleDisconnect = (): void => {
    this.status = 'disconnected';
    if (this.deliberateDisconnect) return;
    this.scheduleReconnect();
  };

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= RECONNECT_BACKOFF_MS.length) {
      console.warn(`[transport:${this.id}] giving up after ${this.reconnectAttempts} attempts`);
      this.status = 'failed';
      return;
    }
    const wait = RECONNECT_BACKOFF_MS[this.reconnectAttempts++];
    console.debug(`[transport:${this.id}] reconnecting in ${wait}ms`);
    window.setTimeout(() => {
      if (this.deliberateDisconnect) return;
      this.gattConnect()
        .then(() => {
          this.reconnectAttempts = 0;
          this.status = 'connected';
        })
        .catch(() => this.scheduleReconnect());
    }, wait);
  }
}
