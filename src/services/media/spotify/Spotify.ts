import type { EventBus } from '../../../engine/EventBus';
import type { EngineEvents } from '../../../engine/types';
import { SpotifyAuth } from './SpotifyAuth';
import { SpotifyClient } from './SpotifyClient';
import { SpotifyPlayback } from './SpotifyPlayback';

/**
 * Spotify — bundles auth + client + playback so SmartMapsEngine has one
 * field to expose and one lifecycle (start / destroy) to manage.
 */
export class Spotify {
  readonly auth: SpotifyAuth;
  readonly client: SpotifyClient;
  readonly playback: SpotifyPlayback;

  constructor(bus: EventBus<EngineEvents>) {
    this.auth = new SpotifyAuth();
    this.client = new SpotifyClient(this.auth);
    this.playback = new SpotifyPlayback(this.client, bus);
  }

  async start(): Promise<void> {
    await this.auth.init();
    this.playback.start();
  }

  async destroy(): Promise<void> {
    this.playback.stop();
    await this.auth.destroy();
  }
}
