import type { EventBus } from '../../../engine/EventBus';
import type { EngineEvents } from '../../../engine/types';
import type { SpotifyClient } from './SpotifyClient';
import type { SpotifyDevice, SpotifyPlaybackState } from './types';

/**
 * SpotifyPlayback — Spotify Connect command surface.
 *
 * No audio is rendered inside our app. We send Web API commands to whichever
 * Spotify device the user has active (their phone's Spotify app, a speaker,
 * the car head unit, …). Premium account required on the user side.
 *
 * Navigation ducking: when VoiceEngine emits 'voice:speak-start' on the
 * engine bus we pause playback (if it was playing) and remember that we did.
 * On 'voice:speak-end' we resume — but only if we were the ones who paused.
 * No restore if the user paused manually mid-TTS.
 */
export class SpotifyPlayback {
  private busUnsubs: Array<() => void> = [];
  private duckedByUs = false;
  private duckRefcount = 0;

  constructor(
    private client: SpotifyClient,
    private bus: EventBus<EngineEvents>
  ) {}

  start(): void {
    this.busUnsubs.push(
      this.bus.on('voice:speak-start', () => {
        void this.handleSpeakStart();
      }),
      this.bus.on('voice:speak-end', () => {
        void this.handleSpeakEnd();
      })
    );
  }

  stop(): void {
    this.busUnsubs.forEach((fn) => fn());
    this.busUnsubs = [];
  }

  // ─── Connect commands ────────────────────────────────────────────────────

  async listDevices(): Promise<SpotifyDevice[]> {
    const data = await this.client.request<{ devices: SpotifyDevice[] }>('/me/player/devices');
    return data.devices;
  }

  async transferPlayback(deviceId: string, autoplay = false): Promise<void> {
    await this.client.request('/me/player', {
      method: 'PUT',
      body: { device_ids: [deviceId], play: autoplay }
    });
  }

  async play(uris?: string[], contextUri?: string): Promise<void> {
    const body: Record<string, unknown> = {};
    if (uris && uris.length > 0) body.uris = uris;
    if (contextUri) body.context_uri = contextUri;
    await this.client.request('/me/player/play', {
      method: 'PUT',
      body: Object.keys(body).length > 0 ? body : undefined
    });
  }

  async pause(): Promise<void> {
    await this.client.request('/me/player/pause', { method: 'PUT' });
  }

  async next(): Promise<void> {
    await this.client.request('/me/player/next', { method: 'POST' });
  }

  async previous(): Promise<void> {
    await this.client.request('/me/player/previous', { method: 'POST' });
  }

  async seek(positionMs: number): Promise<void> {
    const ms = Math.max(0, Math.round(positionMs));
    await this.client.request(`/me/player/seek?position_ms=${ms}`, { method: 'PUT' });
  }

  async getState(): Promise<SpotifyPlaybackState | null> {
    try {
      const data = await this.client.request<SpotifyPlaybackState | undefined>('/me/player');
      return data ?? null;
    } catch {
      return null;
    }
  }

  // ─── ducking ──────────────────────────────────────────────────────────────

  private async handleSpeakStart(): Promise<void> {
    this.duckRefcount += 1;
    if (this.duckRefcount > 1) return;
    try {
      const state = await this.getState();
      if (state?.is_playing) {
        this.duckedByUs = true;
        await this.pause();
      }
    } catch (err) {
      // Ducking is best-effort — never throw up to the speech path.
      console.debug('[SpotifyPlayback] duck pause failed', err);
    }
  }

  private async handleSpeakEnd(): Promise<void> {
    this.duckRefcount = Math.max(0, this.duckRefcount - 1);
    if (this.duckRefcount > 0) return;
    if (!this.duckedByUs) return;
    this.duckedByUs = false;
    try {
      await this.play();
    } catch (err) {
      console.debug('[SpotifyPlayback] duck resume failed', err);
    }
  }
}
