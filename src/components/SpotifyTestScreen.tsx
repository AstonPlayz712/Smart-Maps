import { useEffect, useState } from 'react';
import type { SmartMapsEngine } from '../engine/SmartMapsEngine';
import type {
  SpotifyAuthState,
  SpotifyDevice,
  SpotifyPlaylist,
  SpotifyTrack
} from '../services/media/spotify/types';

interface Props {
  engine: SmartMapsEngine;
}

export default function SpotifyTestScreen({ engine }: Props) {
  const [authState, setAuthState] = useState<SpotifyAuthState>('signed-out');
  const [devices, setDevices] = useState<SpotifyDevice[]>([]);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpotifyTrack[]>([]);
  const [nowPlaying, setNowPlaying] = useState<string>('—');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return engine.spotify.auth.onStateChange((s) => {
      setAuthState(s);
      if (s === 'signed-out') {
        setDevices([]);
        setPlaylists([]);
        setResults([]);
        setNowPlaying('—');
      }
    });
  }, [engine]);

  useEffect(() => {
    if (authState !== 'signed-in') return;
    let cancelled = false;
    (async () => {
      try {
        const [d, p, s] = await Promise.all([
          engine.spotify.playback.listDevices(),
          engine.spotify.client.getMyPlaylists(),
          engine.spotify.playback.getState()
        ]);
        if (cancelled) return;
        setDevices(d);
        setPlaylists(p);
        setNowPlaying(formatNowPlaying(s?.item ?? null, s?.is_playing ?? false));
      } catch (err) {
        if (!cancelled) setError(asError(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [engine, authState]);

  const guard = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      const s = await engine.spotify.playback.getState();
      setNowPlaying(formatNowPlaying(s?.item ?? null, s?.is_playing ?? false));
    } catch (err) {
      setError(asError(err));
    }
  };

  const onSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    try {
      const r = await engine.spotify.client.search(query.trim(), ['track']);
      setResults(r.tracks?.items ?? []);
    } catch (err) {
      setError(asError(err));
    }
  };

  return (
    <div className="media-screen">
      {authState === 'signed-out' ? (
        <div className="media-section">
          <p className="media-blurb">
            Sign in to control Spotify playback on any device where you're
            already logged in (phone, desktop, speaker). Premium account
            required for playback control.
          </p>
          <button
            type="button"
            className="media-btn primary"
            onClick={() => engine.spotify.auth.signIn()}
          >
            Sign in to Spotify
          </button>
        </div>
      ) : (
        <>
          <div className="media-section">
            <div className="media-section-head">
              <span className="media-section-title">Now Playing</span>
              <button
                type="button"
                className="media-btn ghost"
                onClick={() => engine.spotify.auth.signOut()}
              >
                Sign out
              </button>
            </div>
            <div className="media-now">{nowPlaying}</div>
            <div className="media-transport">
              <button type="button" onClick={() => guard(() => engine.spotify.playback.previous())}>⏮</button>
              <button type="button" onClick={() => guard(() => engine.spotify.playback.play())}>▶</button>
              <button type="button" onClick={() => guard(() => engine.spotify.playback.pause())}>⏸</button>
              <button type="button" onClick={() => guard(() => engine.spotify.playback.next())}>⏭</button>
            </div>
          </div>

          <div className="media-section">
            <span className="media-section-title">Devices</span>
            <ul className="media-list">
              {devices.length === 0 && <li className="media-empty">no active devices — open Spotify on a device first</li>}
              {devices.map((d) => (
                <li key={d.id ?? d.name} className={d.is_active ? 'active' : ''}>
                  <button
                    type="button"
                    disabled={!d.id || d.is_active}
                    onClick={() => d.id && guard(() => engine.spotify.playback.transferPlayback(d.id!))}
                  >
                    <span>{d.name}</span>
                    <span className="media-meta">{d.is_active ? 'active' : d.type}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="media-section">
            <span className="media-section-title">Search</span>
            <form className="media-search" onSubmit={onSearch}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tracks…"
                spellCheck={false}
              />
              <button type="submit" className="media-btn primary">Search</button>
            </form>
            <ul className="media-list">
              {results.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => guard(() => engine.spotify.playback.play([t.uri]))}>
                    <span>{t.name}</span>
                    <span className="media-meta">{t.artists.map((a) => a.name).join(', ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="media-section">
            <span className="media-section-title">My playlists</span>
            <ul className="media-list">
              {playlists.length === 0 && <li className="media-empty">no playlists yet</li>}
              {playlists.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => guard(() => engine.spotify.playback.play(undefined, p.uri))}>
                    <span>{p.name}</span>
                    <span className="media-meta">{p.tracks.total} tracks</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {error && <div className="media-error">{error}</div>}
    </div>
  );
}

function formatNowPlaying(item: SpotifyTrack | null, playing: boolean): string {
  if (!item) return '—';
  const artists = item.artists.map((a) => a.name).join(', ');
  return `${playing ? '▶' : '⏸'}  ${item.name} · ${artists}`;
}

function asError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
