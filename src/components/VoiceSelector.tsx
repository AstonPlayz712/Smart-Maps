import { useEffect, useState } from 'react';
import type { SmartMapsEngine } from '../engine/SmartMapsEngine';
import type { CharacterId, Voicepack } from '../services/voice/types';

interface Props {
  engine?: SmartMapsEngine;
}

const ICON: Record<CharacterId, string> = {
  sonic: 'S',
  tails: 'T',
  knuckles: 'K',
  amy: 'A'
};

/**
 * Settings affordance for the character voice. Compact chip in the top
 * overlay (matches LocationProviderChip's language); tap opens a flat
 * popover with the four characters and their taglines.
 */
export default function VoiceSelector({ engine }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<CharacterId>('sonic');
  const [packs, setPacks] = useState<Voicepack[]>([]);

  useEffect(() => {
    if (!engine) return;
    setActive(engine.voice.getCharacter());
    setPacks(engine.voice.listCharacters());
    return engine.voice.onCharacterChange((id) => setActive(id));
  }, [engine]);

  if (!engine) return null;

  const select = (id: CharacterId) => {
    engine.voice.setCharacter(id);
    setOpen(false);
  };

  const activePack = packs.find((p) => p.id === active);

  return (
    <div className="voice-chip-wrap">
      <button
        className="voice-chip"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`Voice: ${activePack?.displayName ?? active}`}
      >
        <span className="voice-icon" aria-hidden>{ICON[active]}</span>
        <span className="voice-label">{activePack?.displayName ?? active}</span>
        <span className="voice-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <ul className="voice-menu" role="listbox" aria-label="Voice characters">
          {packs.map((p) => (
            <li
              key={p.id}
              role="option"
              aria-selected={p.id === active}
              className={p.id === active ? 'primary' : ''}
            >
              <button type="button" onClick={() => select(p.id)}>
                <span className="voice-icon" aria-hidden>{ICON[p.id]}</span>
                <span className="voice-name">{p.displayName}</span>
                <span className="voice-meta">{p.tagline}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
