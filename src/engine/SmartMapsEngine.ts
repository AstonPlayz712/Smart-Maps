import type { Map as MlMap } from 'maplibre-gl';
import { EventBus } from './EventBus';
import type { EngineEvents } from './types';
import { SmartMapsRenderer } from '../modules/smart-maps/SmartMapsRenderer';
import { ImmersiveNavigation } from '../modules/immersive-navigation/ImmersiveNavigation';
import { AskMaps } from '../modules/ask-maps/AskMaps';
import { LOCATIONS, type LocationId } from '../modules/smart-maps/locations';
import { POIS } from '../data/pois';
import { NavigationService } from '../services/NavigationService';
import { LocationProviders } from '../services/location-providers/LocationProviders';
import { VoiceEngine } from '../services/voice/VoiceEngine';
import { Spotify } from '../services/media/spotify/Spotify';
import { MoisesClient } from '../services/media/moises/MoisesClient';
import { buildSmModules, type SmModules } from '../sm';
import { WiFiProvider } from '../services/location-providers/providers/WiFiProvider';
import { BluetoothBeaconProvider } from '../services/location-providers/providers/BluetoothBeaconProvider';
import { AutoExLocationProvider } from '../services/location-providers/providers/AutoExLocationProvider';
import { SensorFusionProvider } from '../services/location-providers/providers/SensorFusionProvider';
import { ManualProvider } from '../services/location-providers/providers/ManualProvider';
import { SmartMapsAE } from '../integration/SmartMapsAE';

export interface EngineOptions {
  initialLocation: LocationId;
  onReady?: () => void;
  onToast?: (msg: string) => void;
}

/**
 * SmartMapsEngine is the unified SM·IN·AM kernel. It owns:
 *
 *   • SmartMapsRenderer        — Smart Maps (MapLibre + 3D buildings + terrain + sky)
 *   • ImmersiveNavigation      — cinematic camera + tap-to-route engine
 *   • AskMaps                  — natural-language command layer
 *
 * The three modules never reach for each other directly — they coordinate through this
 * conductor and the shared EventBus, so any one of them can be swapped out without breaking
 * the rest of the system.
 */
export class SmartMapsEngine {
  private map?: MlMap;
  private container?: HTMLElement;
  private currentLocation: LocationId;

  readonly bus = new EventBus<EngineEvents>();
  readonly renderer: SmartMapsRenderer;
  readonly navigation: ImmersiveNavigation;
  readonly locationProviders: LocationProviders;
  readonly navigationService: NavigationService;
  readonly voice: VoiceEngine;
  readonly spotify: Spotify;
  readonly moises: MoisesClient;
  readonly sm: SmModules;
  readonly askMaps: AskMaps;

  /**
   * The Advanced/Elite stack (Zante native core + Dynamic Engine + AutoMaps
   * IN). Built lazily on attach; runs headless in Stage 1 alongside the live
   * MapLibre surface until the native swapchain lands in Stage 2.
   */
  ae?: SmartMapsAE;

  constructor(opts: EngineOptions) {
    this.currentLocation = opts.initialLocation;
    this.renderer = new SmartMapsRenderer(this.bus);
    this.navigation = new ImmersiveNavigation(this.bus);

    // Location providers come up before NavigationService so the service has a
    // location source from its first tick.
    this.locationProviders = new LocationProviders(
      [
        new WiFiProvider(),
        new BluetoothBeaconProvider(),
        new AutoExLocationProvider(),
        new SensorFusionProvider(),
        new ManualProvider()
      ],
      'wifi'
    );
    this.locationProviders.start();

    this.navigationService = new NavigationService(this);
    this.voice = new VoiceEngine(this);
    this.voice.start();
    this.spotify = new Spotify(this.bus);
    void this.spotify.start();
    this.moises = new MoisesClient();
    this.sm = buildSmModules(this);
    this.askMaps = new AskMaps(this);

    if (opts.onReady) this.bus.on('engine:ready', opts.onReady);
    if (opts.onToast) this.bus.on('engine:toast', opts.onToast);
  }

  attach(container: HTMLElement): void {
    if (this.map) return;
    this.container = container;
    const start = LOCATIONS[this.currentLocation];

    this.map = this.renderer.create(container, start.pose);
    this.navigation.attach(this.map);

    this.map.on('load', () => {
      this.renderer.enableTerrain(true);
      this.renderer.enable3DBuildings(true);
      this.renderer.enableSky();
      this.navigation.flyToPose(start.pose, { duration: 1800 });
      this.bootAE(container, start.pose.center);
      this.bus.emit('engine:ready', undefined);
      this.bus.emit('engine:toast', `Welcome to ${start.name}`);
    });

    // Tap-to-route binding lives on the UI / NavigationService side, not the engine.
    // The engine no longer wires its own click → route shortcut; see App.tsx.
  }

  detach(): void {
    void this.spotify.destroy();
    this.voice.destroy();
    this.navigationService.destroy();
    this.locationProviders.stop();
    this.ae?.dispose();
    this.ae = undefined;
    this.bus.clear();
    this.map?.remove();
    this.map = undefined;
    this.container = undefined;
  }

  /**
   * Stand up the A/E stack for the active map. Guarded so a native-core
   * failure never blocks the live MapLibre experience — A/E is additive in
   * Stage 1.
   */
  private bootAE(container: HTMLElement, center: [number, number]): void {
    if (this.ae) return;
    try {
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      this.ae = new SmartMapsAE({
        bus: this.bus,
        viewport: {
          x: 0,
          y: 0,
          width: container.clientWidth || 1280,
          height: container.clientHeight || 720,
          devicePixelRatio: dpr
        },
        origin: { lng: center[0], lat: center[1] }
      });
      this.ae.start();
    } catch (err) {
      console.error('[SmartMapsEngine] A/E stack failed to boot (non-fatal in Stage 1)', err);
      this.ae = undefined;
    }
  }

  getMap(): MlMap | undefined {
    return this.map;
  }

  getPOIs() {
    return POIS;
  }

  getLocationId(): LocationId {
    return this.currentLocation;
  }

  goToLocation(id: LocationId): void {
    const loc = LOCATIONS[id];
    if (!loc) return;
    this.currentLocation = id;
    this.navigation.flyToPose(loc.pose, { duration: 2800, curve: 1.5 });
    this.bus.emit('engine:toast', `Flying to ${loc.name}`);
  }
}
