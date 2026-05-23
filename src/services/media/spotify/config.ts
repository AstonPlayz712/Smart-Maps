/**
 * Spotify integration constants.
 *
 * The Client ID is a placeholder — replace it once you've registered a real
 * Spotify Developer app (https://developer.spotify.com/dashboard) for
 * `com.smartmaps.os`. PKCE means no client secret in source.
 *
 * Redirect URIs (must match what's registered on the dashboard):
 *   • Capacitor (iOS / Android): com.smartmaps.os://spotify-callback
 *   • Web dev server:            http://localhost:5173/spotify-callback
 */
export const SPOTIFY_CLIENT_ID = 'SPOTIFY_CLIENT_ID_PLACEHOLDER';

export const SPOTIFY_REDIRECT_URI_NATIVE = 'com.smartmaps.os://spotify-callback';
export const SPOTIFY_REDIRECT_URI_WEB = 'http://localhost:5173/spotify-callback';

export const SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative'
].join(' ');

export const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
export const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
export const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

export const SPOTIFY_STORAGE_KEY = 'smartmaps.spotify.tokens';
export const SPOTIFY_PKCE_STORAGE_KEY = 'smartmaps.spotify.pkce';

/** True when running inside Capacitor (iOS / Android). */
export function isCapacitor(): boolean {
  return typeof window !== 'undefined' && !!(window as { Capacitor?: unknown }).Capacitor;
}

export function spotifyRedirectUri(): string {
  return isCapacitor() ? SPOTIFY_REDIRECT_URI_NATIVE : SPOTIFY_REDIRECT_URI_WEB;
}
