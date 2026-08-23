import { useEffect, useState } from 'react';
import type { MapMouseEvent } from 'maplibre-gl';
import MapView from './components/MapView';
import TopStrip from './components/TopStrip';
import NavBanner from './components/NavBanner';
import BottomDeck from './components/BottomDeck';
import SearchSheet from './components/SearchSheet';
import SettingsSheet from './components/SettingsSheet';
import MediaDrawer from './components/MediaDrawer';
import AutoExDebugOverlay from './components/AutoExDebugOverlay';
import Toast from './components/Toast';
import { SmartMapsEngine } from './engine/SmartMapsEngine';
import { LOCATIONS, type LocationId } from './modules/smart-maps/locations';
import { AutoExBridge } from './modules/autolink/AutoExBridge';
import type { AutoExLocationProvider } from './services/location-providers/providers/AutoExLocationProvider';

export default function App() {
  const [engine, setEngine] = useState<SmartMapsEngine | null>(null);
  const [bridge, setBridge] = useState<AutoExBridge | null>(null);
  const [ready, setReady] = useState(false);
  const [activeLocation, setActiveLocation] = useState<LocationId>('london');
  const [toast, setToast] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);

  useEffect(() => {
    const e = new SmartMapsEngine({
      initialLocation: 'london',
      onReady: () => {
        setReady(true);
      },
      onToast: (msg) => {
        setToast(msg);
        window.setTimeout(() => setToast(null), 2400);
      }
    });
    setEngine(e);

    const b = new AutoExBridge();
    b.attachNavigationService(e.navigationService);
    const autoexProvider = e.locationProviders.getProvider<AutoExLocationProvider>('autoex');
    if (autoexProvider) b.attachLocationProvider(autoexProvider);
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

  // Tap on map → start navigation to the tapped lat/lng. Keeps the map
  // surface itself uncluttered (no inline chips) — the NavBanner reflects
  // the result.
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
    <div className="app sm-3d">
      <MapView engine={engine ?? undefined} />

      <TopStrip
        engine={engine ?? undefined}
        onSettings={() => setSettingsOpen(true)}
        onMedia={() => setMediaOpen(true)}
      />

      <NavBanner engine={engine ?? undefined} />

      <BottomDeck
        engine={engine ?? undefined}
        onOpenSearch={() => setSearchOpen(true)}
      />

      <SearchSheet
        engine={engine ?? undefined}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
      />

      <SettingsSheet
        engine={engine ?? undefined}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        locations={LOCATIONS}
        activeLocation={activeLocation}
        onSelectLocation={handleSelectLocation}
        ready={ready}
      />

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
