import type { SmartMapsEngine } from '../../engine/SmartMapsEngine';
import type { Unsubscribe } from '../NavigationService';
import { getVoicepack, VOICEPACK_IDS } from './VoicepackLoader';
import type {
  CharacterId,
  VoiceContext,
  VoiceEvent,
  Voicepack
} from './types';

const STORAGE_KEY = 'smartmaps.voice.character';
const DEFAULT_CHARACTER: CharacterId = 'sonic';

// Distance milestones (m) that trigger a "distance.approach" line. Crossed
// downwards only — we never re-fire when the user backs up.
const DISTANCE_MILESTONES = [1000, 500, 200];

// Minimum gap between any two utterances. Keeps the voice from machine-gunning
// when several events fire close together.
const MIN_UTTERANCE_GAP_MS = 1800;

// IN reactions are rare by design — debounce so even rapid state flips don't
// produce more than one line per window.
const IN_REACTION_COOLDOWN_MS = 8000;

type Listener = (id: CharacterId) => void;

/**
 * VoiceEngine — Smart Maps OS character voice system.
 *
 * Subscribes to NavigationService + the engine bus, picks lines from the
 * active voicepack, and speaks them via the Web Speech Synthesis API. Voice
 * profile (rate / pitch / volume) is per-character.
 *
 * Triggers:
 *   nav.start                first time state flips to 'navigating'
 *   distance.approach        each downward crossing of 1 km / 500 m / 200 m
 *   arrival.near             downward crossing of 60 m
 *   arrival.destination      state → 'arrived'
 *   recalculation            new route while state was already 'navigating'
 *   in.junction.approach     'in:junction' fires with inJunction=true
 *   in.zoom.out              'in:zoomout' fires (high-speed wider FOV)
 *
 * Cross-platform: Web Speech is available in Capacitor's WKWebView (iOS) and
 * Android WebView. The same engine ships in both binaries — no platform-
 * specific paths.
 */
export class VoiceEngine {
  private currentId: CharacterId;
  private active = false;
  private lastSpokeAt = 0;
  private lastDistanceMilestone: number | null = null;
  private nearArrivalAnnounced = false;
  private lastNavState: string | null = null;
  private lastJunctionAnnouncedAt = 0;
  private lastZoomOutAnnouncedAt = 0;
  private unsubs: Unsubscribe[] = [];
  private characterListeners = new Set<Listener>();

  constructor(private engine: SmartMapsEngine) {
    this.currentId = this.loadPersistedCharacter();
  }

  // ─── lifecycle ────────────────────────────────────────────────────────────

  start(): void {
    if (this.active) return;
    this.active = true;

    const svc = this.engine.navigationService;
    this.unsubs.push(
      svc.onNavigationStateChange((s) => this.handleState(s), 'ui'),
      svc.onRouteUpdate((r) => this.handleRoute(r), 'ui'),
      svc.onLocationUpdate(() => this.handleLocationTick(), 'ui'),
      this.engine.bus.on('in:junction', (e) => this.handleJunction(e)),
      this.engine.bus.on('in:zoomout', () => this.handleZoomOut())
    );
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.unsubs.forEach((fn) => fn());
    this.unsubs = [];
    this.cancelSpeech();
  }

  destroy(): void {
    this.stop();
    this.characterListeners.clear();
  }

  // ─── character ────────────────────────────────────────────────────────────

  getCharacter(): CharacterId {
    return this.currentId;
  }

  setCharacter(id: CharacterId): void {
    if (!VOICEPACK_IDS.includes(id) || id === this.currentId) return;
    this.currentId = id;
    this.persistCharacter(id);
    this.characterListeners.forEach((cb) => {
      try {
        cb(id);
      } catch (err) {
        console.error('[VoiceEngine] character listener error', err);
      }
    });
    // Confirm switch with a single line so the user hears the new voice.
    this.speak('nav.start');
  }

  onCharacterChange(cb: Listener): Unsubscribe {
    this.characterListeners.add(cb);
    return () => {
      this.characterListeners.delete(cb);
    };
  }

  listCharacters(): Voicepack[] {
    return VOICEPACK_IDS.map((id) => getVoicepack(id));
  }

  // ─── public speech API ───────────────────────────────────────────────────

  /**
   * Speak an event line. Public so AutoEx, Ask Maps, or any future module can
   * trigger speech without re-implementing line selection.
   */
  speak(event: VoiceEvent, context: VoiceContext = {}): void {
    if (!this.active) return;
    const now = Date.now();
    if (now - this.lastSpokeAt < MIN_UTTERANCE_GAP_MS) return;

    const pack = getVoicepack(this.currentId);
    const lines = pack.events[event];
    if (!lines || lines.length === 0) return;

    const template = lines[Math.floor(Math.random() * lines.length)];
    const text = fillTemplate(template, context);
    if (!text.trim()) return;

    this.utter(text, pack);
    this.lastSpokeAt = now;
  }

  // ─── handlers ─────────────────────────────────────────────────────────────

  private handleState(state: string): void {
    if (state === 'navigating' && this.lastNavState !== 'navigating') {
      const route = this.engine.navigationService.getRoute();
      this.speak('nav.start', {
        distance: route ? formatDistance(route.distanceMeters) : ''
      });
      this.lastDistanceMilestone = route?.distanceMeters ?? null;
      this.nearArrivalAnnounced = false;
    } else if (state === 'arrived') {
      this.speak('arrival.destination');
    } else if (state === 'idle' || state === 'stopped') {
      this.cancelSpeech();
    }
    this.lastNavState = state;
  }

  private handleRoute(route: unknown): void {
    // Recalculation: a fresh route lands while we were already navigating.
    if (route && this.lastNavState === 'navigating') {
      this.speak('recalculation');
    }
  }

  private handleLocationTick(): void {
    const remaining = this.engine.navigationService.getRemainingMeters();
    if (remaining === null) return;

    // Distance milestones — fire on downward crossings only.
    for (const milestone of DISTANCE_MILESTONES) {
      const wasAbove =
        this.lastDistanceMilestone === null || this.lastDistanceMilestone > milestone;
      const nowAtOrBelow = remaining <= milestone;
      if (wasAbove && nowAtOrBelow) {
        this.speak('distance.approach', { distance: formatDistance(remaining) });
        break;
      }
    }

    // Near-arrival: 60 m threshold, once per route.
    if (!this.nearArrivalAnnounced && remaining < 60 && remaining > 35) {
      this.nearArrivalAnnounced = true;
      this.speak('arrival.near');
    }

    this.lastDistanceMilestone = remaining;
  }

  private handleJunction(e: { inJunction: boolean; distanceMeters: number }): void {
    if (!e.inJunction) return;
    const now = Date.now();
    if (now - this.lastJunctionAnnouncedAt < IN_REACTION_COOLDOWN_MS) return;
    this.lastJunctionAnnouncedAt = now;
    this.speak('in.junction.approach', { distance: formatDistance(e.distanceMeters) });
  }

  private handleZoomOut(): void {
    const now = Date.now();
    if (now - this.lastZoomOutAnnouncedAt < IN_REACTION_COOLDOWN_MS) return;
    this.lastZoomOutAnnouncedAt = now;
    this.speak('in.zoom.out');
  }

  // ─── TTS ─────────────────────────────────────────────────────────────────

  private utter(text: string, pack: Voicepack): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = pack.voice.rate;
      u.pitch = pack.voice.pitch;
      u.volume = pack.voice.volume;
      u.lang = pack.voice.lang;
      window.speechSynthesis.speak(u);
    } catch (err) {
      console.warn('[VoiceEngine] TTS failed', err);
    }
  }

  private cancelSpeech(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* noop */
      }
    }
  }

  // ─── persistence ─────────────────────────────────────────────────────────

  private loadPersistedCharacter(): CharacterId {
    if (typeof localStorage === 'undefined') return DEFAULT_CHARACTER;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw && VOICEPACK_IDS.includes(raw as CharacterId)) {
        return raw as CharacterId;
      }
    } catch {
      /* noop */
    }
    return DEFAULT_CHARACTER;
  }

  private persistCharacter(id: CharacterId): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* noop */
    }
  }
}

function fillTemplate(template: string, ctx: VoiceContext): string {
  return template
    .replace(/\{distance\}/g, ctx.distance ?? '')
    .replace(/\{street\}/g, ctx.street ?? '')
    .replace(/\{road\}/g, ctx.road ?? '')
    .replace(/\{exit\}/g, ctx.exit ?? '')
    .replace(/\{lane\}/g, ctx.lane ?? '');
}

function formatDistance(m: number | null | undefined): string {
  if (m === null || m === undefined || !Number.isFinite(m)) return '';
  if (m < 950) return `${Math.max(10, Math.round(m / 10) * 10)} meters`;
  return `${(m / 1000).toFixed(1)} kilometers`;
}
