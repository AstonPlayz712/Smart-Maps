import type { SmartMapsEngine } from '../engine/SmartMapsEngine';
import type { LocationDef, LocationId } from '../modules/smart-maps/locations';
import LiquidGlass from './LiquidGlass';
import LocationSwitcher from './LocationSwitcher';
import VoiceSelector from './VoiceSelector';
import LocationProviderChip from './LocationProviderChip';
import CameraControls from './CameraControls';

interface Props {
  engine?: SmartMapsEngine;
  open: boolean;
  onClose: () => void;
  locations: Record<LocationId, LocationDef>;
  activeLocation: LocationId;
  onSelectLocation: (id: LocationId) => void;
  ready: boolean;
}

/**
 * Slide-down LG settings sheet. Hosts the existing inline chips
 * (LocationSwitcher, VoiceSelector, LocationProviderChip) plus the
 * CameraControls cluster so the map surface itself stays uncluttered.
 */
export default function SettingsSheet({
  engine,
  open,
  onClose,
  locations,
  activeLocation,
  onSelectLocation,
  ready
}: Props) {
  if (!open || !engine) return null;
  return (
    <div className="settings-sheet-wrap" onClick={onClose} role="dialog" aria-modal="true">
      <LiquidGlass
        className="settings-sheet"
        thickness="thick"
        glow="subtle"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-sheet-head">
          <span className="settings-title">Settings</span>
          <button
            type="button"
            className="settings-close"
            onClick={onClose}
            aria-label="Close settings"
          >
            ✕
          </button>
        </div>
        <div className="settings-sheet-body">
          <section className="settings-row">
            <span className="settings-label">Location</span>
            <LocationSwitcher
              locations={locations}
              activeId={activeLocation}
              onSelect={(id) => {
                onSelectLocation(id);
                onClose();
              }}
            />
          </section>
          <section className="settings-row">
            <span className="settings-label">Voice</span>
            <VoiceSelector engine={engine} />
          </section>
          <section className="settings-row">
            <span className="settings-label">Source</span>
            <LocationProviderChip engine={engine} />
          </section>
          <section className="settings-row vertical">
            <span className="settings-label">Camera</span>
            <CameraControls engine={engine} ready={ready} />
          </section>
        </div>
      </LiquidGlass>
    </div>
  );
}
