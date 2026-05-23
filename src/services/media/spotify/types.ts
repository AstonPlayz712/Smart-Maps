export interface SpotifyTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
  scope: string;
}

export type SpotifyAuthState = 'signed-out' | 'signed-in';

export interface SpotifyImage {
  url: string;
  width?: number;
  height?: number;
}

export interface SpotifyArtist {
  id: string;
  name: string;
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  images: SpotifyImage[];
}

export interface SpotifyTrack {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  preview_url: string | null;
}

export interface SpotifyPlaylist {
  id: string;
  uri: string;
  name: string;
  description: string | null;
  images: SpotifyImage[];
  tracks: { total: number };
  owner: { display_name?: string; id: string };
}

export interface SpotifyDevice {
  id: string | null;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  name: string;
  type: string;
  volume_percent: number | null;
}

export interface SpotifyPlaybackState {
  device: SpotifyDevice | null;
  is_playing: boolean;
  progress_ms: number | null;
  item: SpotifyTrack | null;
}

export interface SpotifyAudioFeatures {
  id: string;
  duration_ms: number;
  tempo: number;
  energy: number;
  danceability: number;
  valence: number;
  loudness: number;
  key: number;
  mode: number;
  time_signature: number;
}

export interface SpotifySearchResult {
  tracks?: { items: SpotifyTrack[] };
  playlists?: { items: SpotifyPlaylist[] };
}
