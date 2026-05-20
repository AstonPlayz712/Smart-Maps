import { useEffect, useState } from 'react';
import MapView from './components/MapView';
import AskMapsBar from './components/AskMapsBar';
import LocationSwitcher from './components/LocationSwitcher';
import HUD from './components/HUD';
import Toast from './components/Toast';
import { SmartMapsEngine } from './engine/SmartMapsEngine';
import { LOCATIONS, type LocationId } from './modules/smart-maps/locations';

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
    return () => {
      e.detach();
      setEngine(null);
      setReady(false);
    };
  }, []);

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
        <LocationSwitcher
          locations={LOCATIONS}
          activeId={activeLocation}
          onSelect={handleSelectLocation}
        />
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
