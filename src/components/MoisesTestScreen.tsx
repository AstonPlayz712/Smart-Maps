import { useEffect, useRef, useState } from 'react';
import type { SmartMapsEngine } from '../engine/SmartMapsEngine';
import { MoisesJob } from '../services/media/moises/MoisesJob';
import type { MoisesJobSnapshot } from '../services/media/moises/types';

interface Props {
  engine: SmartMapsEngine;
}

export default function MoisesTestScreen({ engine }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [keyStored, setKeyStored] = useState(false);
  const [snapshot, setSnapshot] = useState<MoisesJobSnapshot | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const jobRef = useRef<MoisesJob | null>(null);

  useEffect(() => {
    const k = engine.moises.getApiKey() ?? '';
    setApiKey(k);
    setKeyStored(!!k);
  }, [engine]);

  useEffect(() => {
    return () => {
      jobRef.current?.cancel();
    };
  }, []);

  const saveKey = () => {
    engine.moises.setApiKey(apiKey);
    setKeyStored(engine.moises.hasApiKey());
  };

  const clearKey = () => {
    engine.moises.clearApiKey();
    setApiKey('');
    setKeyStored(false);
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    jobRef.current?.cancel();
    const job = MoisesJob.start(engine.moises, file);
    jobRef.current = job;
    job.onProgress((s) => setSnapshot(s));
  };

  const status = snapshot?.status ?? 'picking';
  const result = snapshot?.result;

  return (
    <div className="media-screen">
      <div className="media-section">
        <span className="media-section-title">API key</span>
        <p className="media-blurb">
          Paste your Moises Developer API key. Stored only in this device's
          local storage — never sent anywhere except Moises itself.
        </p>
        <div className="media-search">
          <input
            type="password"
            value={apiKey}
            placeholder="Moises API key…"
            onChange={(e) => setApiKey(e.target.value)}
          />
          <button type="button" className="media-btn primary" onClick={saveKey}>
            Save
          </button>
          {keyStored && (
            <button type="button" className="media-btn ghost" onClick={clearKey}>
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="media-section">
        <span className="media-section-title">Upload audio</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          style={{ display: 'none' }}
          onChange={onPickFile}
        />
        <button
          type="button"
          className="media-btn primary"
          disabled={!keyStored}
          onClick={() => fileInputRef.current?.click()}
        >
          Choose audio file
        </button>
        {!keyStored && (
          <p className="media-blurb">Save an API key first.</p>
        )}
        {filename && (
          <p className="media-blurb">
            <strong>{filename}</strong> · status: <em className={`media-status ${status}`}>{status}</em>
          </p>
        )}
        {status === 'uploading' && snapshot?.uploadPercent !== undefined && (
          <div className="media-progress">
            <div className="media-progress-fill" style={{ width: `${snapshot.uploadPercent}%` }} />
          </div>
        )}
        {snapshot?.error && <div className="media-error">{snapshot.error}</div>}
      </div>

      {result && (
        <>
          <div className="media-section">
            <span className="media-section-title">
              Tempo{result.bpm !== undefined && ` · ${result.bpm.toFixed(1)} BPM`}
            </span>
            {result.beats.length > 0 ? (
              <div className="media-beats" aria-label="First 16 beats">
                {result.beats.slice(0, 16).map((b, i) => (
                  <span
                    key={i}
                    className={`media-beat pos-${b.position}`}
                    title={`${b.time.toFixed(2)}s · beat ${b.position}`}
                  />
                ))}
              </div>
            ) : (
              <p className="media-blurb">No beats returned.</p>
            )}
          </div>

          <div className="media-section">
            <span className="media-section-title">Stems</span>
            <ul className="media-list">
              {result.stems.length === 0 && <li className="media-empty">No stems returned.</li>}
              {result.stems.map((s) => (
                <li key={s.name}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    <span>{s.name}</span>
                    <span className="media-meta">download</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
