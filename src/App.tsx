import { useEffect, useState } from 'react';
import type { MapMouseEvent } from 'maplibre-gl';
import MapView from './components/MapView';
import AskMapsBar from './components/AskMapsBar';
import LocationSwitcher from './components/LocationSwitcher';
import LocationProviderChip from './components/LocationProviderChip';
import HUD from './components/HUD';
import Toast from './components/Toast';
import { SmartMapsEngine } from './engine/SmartMapsEngine';
import { LOCATIONS, type LocationId } from './modules/smart-maps/locations';
import { AutoLinkBridge } from './modules/autolink/AutoLinkBridge';

export default function App() {
  const [engine, setEngine] = useState<SmartMapsEngine | null>(null);
  const [ready, setReady] = useState(false);
  const [activeLocation, setActiveLocation] = useState<LocationId>('london');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const e = new SmartMapsEngine({
      initialLocation: 'london',
      onReady: () => setReady(true),
      onToast: (msg) => {
        setToast(msg);
        window.setTimeout(() => setToast(null), 2400);
      }
    });
    setEngine(e);

    // AutoLink module — talks ONLY to the navigation service, never the engine.
    const autoLink = new AutoLinkBridge(e.navigationService);
    autoLink.start();

    return () => {
      autoLink.stop();
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
          <LocationProviderChip engine={engine ?? undefined} />
          <LocationSwitcher
            locations={LOCATIONS}
            activeId={activeLocation}
            onSelect={handleSelectLocation}
          />
        </div>
      </div>

      <HUD engine={engine ?? undefined} ready={ready} />

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

      <Toast message={toast} />
    </div>
  );
}
