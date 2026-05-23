import { useEffect, useState } from 'react';
import type { MapMouseEvent } from 'maplibre-gl';
import MapView from './components/MapView';
import AskMapsBar from './components/AskMapsBar';
import LocationSwitcher from './components/LocationSwitcher';
import LocationProviderChip from './components/LocationProviderChip';
import VoiceSelector from './components/VoiceSelector';
import MediaChip from './components/MediaChip';
import MediaDrawer from './components/MediaDrawer';
import AutoExDebugOverlay from './components/AutoExDebugOverlay';
import HUD from './components/HUD';
import CameraControls from './components/CameraControls';
import Toast from './components/Toast';
import { SmartMapsEngine } from './engine/SmartMapsEngine';
import { LOCATIONS, type LocationId } from './modules/smart-maps/locations';
import { AutoExBridge } from './modules/autolink/AutoExBridge';
import type { AutoExLocationProvider } from './services/location-providers/providers/AutoExLocationProvider';
import { markBootReady } from './boot';

export default function App() {
  const [engine, setEngine] = useState<SmartMapsEngine | null>(null);
  const [bridge, setBridge] = useState<AutoExBridge | null>(null);
  const [ready, setReady] = useState(false);
  const [activeLocation, setActiveLocation] = useState<LocationId>('london');
  const [toast, setToast] = useState<string | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);

  useEffect(() => {
    const e = new SmartMapsEngine({
      initialLocation: 'london',
      onReady: () => {
        setReady(true);
        // Boot complete — clear the HTML heartbeat overlay and reset the
        // crash counter. From here, errors are runtime, not boot.
        markBootReady();
      },
      onToast: (msg) => {
        setToast(msg);
        window.setTimeout(() => setToast(null), 2400);
      }
    });
    setEngine(e);

    // AutoEx — external transport bridge. Forwards navigation events out to
    // an AutoOSM companion (when one is connected) and routes inbound
    // `location:fix` packets into the AutoEx location provider.
    const b = new AutoExBridge();
    b.attachNavigationService(e.navigationService);
    const autoexProvider = e.locationProviders.getProvider<AutoExLocationProvider>('autoex');
    if (autoexProvider) b.attachLocationProvider(autoexProvider);
    // Best-effort: try to connect now. Wi-Fi Direct is normally unavailable in
    // browsers (stub), BLE needs a user gesture, so this usually falls through
    // to WebSocket — which fails silently when no relay is running. The dev
    // overlay surfaces all of that and offers a Retry button.
    void b.connect();
    setBridge(b);

    return () => {
      b.destroy();
      setBridge(null);
      e.detach();
      setEngine(null);
      setReady(false);
    };
  }, []);

  // Map tap → navigation service. The engine no longer handles clicks itself; the
  // UI surface is responsible for translating taps into navigation intent so all
  // navigation goes through the service.
  useEffect(() => {
    if (!engine || !ready) return;
    const map = engine.getMap();
    if (!map) return;
    const handler = (e: MapMouseEvent) => {
      engine.navigationService.startNavigation({
        lng: e.lngLat.lng,
        lat: e.lngLat.lat
      });
    };
    map.on('click', handler);
    return () => {
      map.off('click', handler);
    };
  }, [engine, ready]);

  const handleSelectLocation = (id: LocationId) => {
    setActiveLocation(id);
    engine?.goToLocation(id);
  };

  return (
    <div className="app">
      <MapView engine={engine ?? undefined} />

      <div className="overlay top">
        <div className="brand" title="Smart Maps · Immersive Navigation · Ask Maps">
          <span className="brand-dot" />
          Smart Maps <span className="brand-os">OS</span>
        </div>
        <div className="top-right-group">
          <MediaChip onOpen={() => setMediaOpen(true)} active={mediaOpen} />
          <VoiceSelector engine={engine ?? undefined} />
          <LocationProviderChip engine={engine ?? undefined} />
          <LocationSwitcher
            locations={LOCATIONS}
            activeId={activeLocation}
            onSelect={handleSelectLocation}
          />
        </div>
      </div>

      <HUD engine={engine ?? undefined} ready={ready} />
      <CameraControls engine={engine ?? undefined} ready={ready} />

      <div className="overlay bottom">
        <AskMapsBar
          onAsk={(q) => engine?.askMaps.run(q)}
          suggestions={
            activeLocation === 'london'
              ? [
                  'fly to London Eye',
                  'orbit Tower Bridge',
                  'route to Big Ben',
                  'show 3D buildings',
                  'cinematic tour',
                  'night mode'
                ]
              : [
                  'fly to Navagio Beach',
                  'orbit Blue Caves',
                  'show terrain',
                  'tilt 75',
                  'cinematic tour',
                  'dusk mode'
                ]
          }
        />
      </div>

      {engine && (
        <MediaDrawer
          engine={engine}
          open={mediaOpen}
          onClose={() => setMediaOpen(false)}
        />
      )}

      {import.meta.env.DEV && <AutoExDebugOverlay bridge={bridge} />}

      <Toast message={toast} />
    </div>
  );
}
