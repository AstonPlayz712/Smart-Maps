import { App, type URLOpenListenerEvent } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import {
  SPOTIFY_AUTH_URL,
  SPOTIFY_CLIENT_ID,
  SPOTIFY_PKCE_STORAGE_KEY,
  SPOTIFY_SCOPES,
  SPOTIFY_STORAGE_KEY,
  SPOTIFY_TOKEN_URL,
  isCapacitor,
  spotifyRedirectUri
} from './config';
import type { SpotifyAuthState, SpotifyTokens } from './types';

type Listener = (state: SpotifyAuthState) => void;

interface PkceState {
  verifier: string;
  state: string;
}

/**
 * SpotifyAuth — PKCE OAuth flow for Spotify Web API.
 *
 * Native (Capacitor): opens the authorize URL in the system browser via
 * `@capacitor/browser`, listens for the `com.smartmaps.os://spotify-callback`
 * deep link via `@capacitor/app`'s `appUrlOpen` event, then exchanges the
 * code for tokens with the PKCE verifier (no client secret).
 *
 * Web (dev server): same flow, but the redirect is `http://localhost:5173/
 * spotify-callback` and the page reload is intercepted by `handleRedirect`.
 *
 * Tokens persist in localStorage; `getValidToken` refreshes silently.
 */
export class SpotifyAuth {
  private listeners = new Set<Listener>();
  private appUrlListenerHandle: { remove: () => Promise<void> } | null = null;
  private refreshTimer: number | null = null;
  private currentTokens: SpotifyTokens | null = null;

  constructor() {
    this.currentTokens = this.loadTokens();
    if (this.currentTokens) this.scheduleRefresh();
  }

  // ─── lifecycle ────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    if (isCapacitor()) {
      this.appUrlListenerHandle = await App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
        if (event.url && event.url.startsWith('com.smartmaps.os://spotify-callback')) {
          void this.handleRedirect(event.url);
          void Browser.close();
        }
      });
    } else if (typeof window !== 'undefined' && window.location.pathname === '/spotify-callback') {
      void this.handleRedirect(window.location.href);
    }
  }

  async destroy(): Promise<void> {
    if (this.appUrlListenerHandle) {
      await this.appUrlListenerHandle.remove();
      this.appUrlListenerHandle = null;
    }
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.listeners.clear();
  }

  // ─── public API ───────────────────────────────────────────────────────────

  async signIn(): Promise<void> {
    const verifier = this.randomString(64);
    const challenge = await this.sha256Base64Url(verifier);
    const state = this.randomString(16);
    this.persistPkce({ verifier, state });

    const params = new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      response_type: 'code',
      redirect_uri: spotifyRedirectUri(),
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state,
      scope: SPOTIFY_SCOPES
    });
    const authorizeUrl = `${SPOTIFY_AUTH_URL}?${params.toString()}`;

    if (isCapacitor()) {
      await Browser.open({ url: authorizeUrl, presentationStyle: 'popover' });
    } else {
      window.location.href = authorizeUrl;
    }
  }

  async signOut(): Promise<void> {
    this.currentTokens = null;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(SPOTIFY_STORAGE_KEY);
        localStorage.removeItem(SPOTIFY_PKCE_STORAGE_KEY);
      } catch {
        /* noop */
      }
    }
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.emit('signed-out');
  }

  isSignedIn(): boolean {
    return !!this.currentTokens;
  }

  getState(): SpotifyAuthState {
    return this.currentTokens ? 'signed-in' : 'signed-out';
  }

  /** Returns a valid access token, refreshing if expired. Throws if signed out. */
  async getValidToken(): Promise<string> {
    if (!this.currentTokens) throw new Error('not signed in');
    if (this.currentTokens.expiresAt - Date.now() > 30_000) {
      return this.currentTokens.accessToken;
    }
    await this.refresh();
    if (!this.currentTokens) throw new Error('not signed in');
    return this.currentTokens.accessToken;
  }

  onStateChange(cb: Listener): () => void {
    this.listeners.add(cb);
    try {
      cb(this.getState());
    } catch (err) {
      console.error('[SpotifyAuth] listener error', err);
    }
    return () => {
      this.listeners.delete(cb);
    };
  }

  // ─── redirect handler ────────────────────────────────────────────────────

  async handleRedirect(url: string): Promise<void> {
    const parsed = this.parseRedirect(url);
    if (!parsed) return;

    const pkce = this.loadPkce();
    if (!pkce) {
      console.warn('[SpotifyAuth] missing PKCE state — ignoring redirect');
      return;
    }
    if (parsed.state !== pkce.state) {
      console.warn('[SpotifyAuth] state mismatch — ignoring redirect');
      return;
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: parsed.code,
      redirect_uri: spotifyRedirectUri(),
      client_id: SPOTIFY_CLIENT_ID,
      code_verifier: pkce.verifier
    });

    const res = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
    if (!res.ok) {
      console.error('[SpotifyAuth] token exchange failed', await res.text());
      return;
    }
    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope: string;
    };

    this.commitTokens({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      scope: data.scope
    });

    // Clean PKCE state and the ?code= from the URL on web.
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(SPOTIFY_PKCE_STORAGE_KEY);
      } catch {
        /* noop */
      }
    }
    if (!isCapacitor() && typeof history !== 'undefined') {
      history.replaceState({}, '', '/');
    }
  }

  // ─── internals ────────────────────────────────────────────────────────────

  private async refresh(): Promise<void> {
    if (!this.currentTokens) return;
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.currentTokens.refreshToken,
      client_id: SPOTIFY_CLIENT_ID
    });
    const res = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
    if (!res.ok) {
      console.warn('[SpotifyAuth] refresh failed — signing out');
      await this.signOut();
      return;
    }
    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
    };
    this.commitTokens({
      accessToken: data.access_token,
      // Spotify may rotate the refresh token; fall back to the existing one if not.
      refreshToken: data.refresh_token ?? this.currentTokens.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
      scope: data.scope
    });
  }

  private commitTokens(t: SpotifyTokens): void {
    this.currentTokens = t;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(SPOTIFY_STORAGE_KEY, JSON.stringify(t));
      } catch {
        /* noop */
      }
    }
    this.scheduleRefresh();
    this.emit('signed-in');
  }

  private loadTokens(): SpotifyTokens | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(SPOTIFY_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as SpotifyTokens;
    } catch {
      return null;
    }
  }

  private persistPkce(p: PkceState): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(SPOTIFY_PKCE_STORAGE_KEY, JSON.stringify(p));
    } catch {
      /* noop */
    }
  }

  private loadPkce(): PkceState | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(SPOTIFY_PKCE_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as PkceState;
    } catch {
      return null;
    }
  }

  private parseRedirect(url: string): { code: string; state: string } | null {
    const queryStart = url.indexOf('?');
    if (queryStart === -1) return null;
    const params = new URLSearchParams(url.slice(queryStart + 1));
    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) return null;
    return { code, state };
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (!this.currentTokens) return;
    const delay = Math.max(15_000, this.currentTokens.expiresAt - Date.now() - 60_000);
    this.refreshTimer = window.setTimeout(() => {
      void this.refresh();
    }, delay);
  }

  private emit(state: SpotifyAuthState): void {
    this.listeners.forEach((cb) => {
      try {
        cb(state);
      } catch (err) {
        console.error('[SpotifyAuth] listener error', err);
      }
    });
  }

  // ─── PKCE helpers ─────────────────────────────────────────────────────────

  private randomString(byteLength: number): string {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return this.base64Url(bytes);
  }

  private async sha256Base64Url(input: string): Promise<string> {
    const data = new TextEncoder().encode(input);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return this.base64Url(new Uint8Array(hash));
  }

  private base64Url(bytes: Uint8Array): string {
    let str = '';
    for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}
