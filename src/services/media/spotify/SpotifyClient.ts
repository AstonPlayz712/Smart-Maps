import { SPOTIFY_API_BASE } from './config';
import type { SpotifyAuth } from './SpotifyAuth';
import type {
  SpotifyAudioFeatures,
  SpotifyPlaylist,
  SpotifySearchResult,
  SpotifyTrack
} from './types';

/**
 * SpotifyClient — thin fetch wrapper over the Web API authed via
 * SpotifyAuth.getValidToken(). Covers search, playlist browsing, and audio
 * features. Playback control lives in SpotifyPlayback.
 *
 * On 401 the client refreshes the token and retries once. Any further error
 * is surfaced as an Error so callers can render it.
 */
export class SpotifyClient {
  constructor(private auth: SpotifyAuth) {}

  // ─── search ───────────────────────────────────────────────────────────────

  async search(
    query: string,
    types: Array<'track' | 'playlist'> = ['track']
  ): Promise<SpotifySearchResult> {
    const params = new URLSearchParams({
      q: query,
      type: types.join(','),
      limit: '20'
    });
    return this.request<SpotifySearchResult>(`/search?${params.toString()}`);
  }

  // ─── playlists ────────────────────────────────────────────────────────────

  async getMyPlaylists(): Promise<SpotifyPlaylist[]> {
    const data = await this.request<{ items: SpotifyPlaylist[] }>('/me/playlists?limit=50');
    return data.items;
  }

  async getPlaylistTracks(playlistId: string): Promise<SpotifyTrack[]> {
    const data = await this.request<{ items: Array<{ track: SpotifyTrack | null }> }>(
      `/playlists/${encodeURIComponent(playlistId)}/tracks?limit=100`
    );
    return data.items.map((i) => i.track).filter((t): t is SpotifyTrack => !!t);
  }

  // ─── audio features ───────────────────────────────────────────────────────

  async getAudioFeatures(trackId: string): Promise<SpotifyAudioFeatures> {
    return this.request<SpotifyAudioFeatures>(
      `/audio-features/${encodeURIComponent(trackId)}`
    );
  }

  async getAudioFeaturesBulk(trackIds: string[]): Promise<SpotifyAudioFeatures[]> {
    if (trackIds.length === 0) return [];
    const params = new URLSearchParams({ ids: trackIds.slice(0, 100).join(',') });
    const data = await this.request<{ audio_features: SpotifyAudioFeatures[] }>(
      `/audio-features?${params.toString()}`
    );
    return data.audio_features;
  }

  // ─── internals ────────────────────────────────────────────────────────────

  /**
   * Internal request with automatic 401-retry. Exposed for `SpotifyPlayback`
   * so playback commands share the same retry + auth plumbing.
   */
  async request<T>(
    path: string,
    init: { method?: string; body?: unknown } = {}
  ): Promise<T> {
    const doFetch = async () => {
      const token = await this.auth.getValidToken();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`
      };
      const fetchInit: RequestInit = {
        method: init.method ?? 'GET',
        headers
      };
      if (init.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        fetchInit.body = JSON.stringify(init.body);
      }
      return fetch(`${SPOTIFY_API_BASE}${path}`, fetchInit);
    };

    let res = await doFetch();
    if (res.status === 401) {
      // Token might have expired mid-request; force a refresh and retry once.
      await this.auth.getValidToken();
      res = await doFetch();
    }
    if (res.status === 204) {
      return undefined as unknown as T;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`spotify ${res.status}: ${text || res.statusText}`);
    }
    return (await res.json()) as T;
  }
}
