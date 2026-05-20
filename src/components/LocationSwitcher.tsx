import type { LocationDef, LocationId } from '../modules/smart-maps/locations';

interface Props {
  locations: Record<LocationId, LocationDef>;
  activeId: LocationId;
  onSelect: (id: LocationId) => void;
}

export default function LocationSwitcher({ locations, activeId, onSelect }: Props) {
  return (
    <div className="loc-switch" role="tablist" aria-label="Location">
      {Object.values(locations).map((loc) => (
        <button
          key={loc.id}
          role="tab"
          type="button"
          aria-selected={loc.id === activeId}
          className={loc.id === activeId ? 'active' : ''}
          onClick={() => onSelect(loc.id)}
          title={loc.description}
        >
          {loc.name}
        </button>
      ))}
    </div>
  );
}
