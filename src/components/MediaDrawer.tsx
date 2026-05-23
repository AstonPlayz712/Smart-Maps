import { useState } from 'react';
import type { SmartMapsEngine } from '../engine/SmartMapsEngine';
import SpotifyTestScreen from './SpotifyTestScreen';
import MoisesTestScreen from './MoisesTestScreen';

interface Props {
  engine: SmartMapsEngine;
  open: boolean;
  onClose: () => void;
}

type Tab = 'spotify' | 'moises';

export default function MediaDrawer({ engine, open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('spotify');
  if (!open) return null;

  return (
    <div className="media-drawer" role="dialog" aria-label="Media services">
      <div className="media-drawer-head">
        <div className="media-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'spotify'}
            className={tab === 'spotify' ? 'active' : ''}
            onClick={() => setTab('spotify')}
          >
            Spotify
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'moises'}
            className={tab === 'moises' ? 'active' : ''}
            onClick={() => setTab('moises')}
          >
            Moises
          </button>
        </div>
        <button
          type="button"
          className="media-drawer-close"
          onClick={onClose}
          aria-label="Close media drawer"
        >
          ✕
        </button>
      </div>
      <div className="media-drawer-body">
        {tab === 'spotify' ? (
          <SpotifyTestScreen engine={engine} />
        ) : (
          <MoisesTestScreen engine={engine} />
        )}
      </div>
    </div>
  );
}
