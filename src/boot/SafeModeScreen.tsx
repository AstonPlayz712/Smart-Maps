import { exitSafeMode } from './SafeMode';

/**
 * Fallback UI shown when `isSafeMode()` is true. No engine, no MapLibre,
 * no AI / voice / media services — just enough to recover.
 */
export default function SafeModeScreen() {
  const onExit = () => {
    exitSafeMode();
    location.reload();
  };
  const onReset = () => {
    try {
      localStorage.clear();
    } catch {
      /* noop */
    }
    location.reload();
  };

  return (
    <div className="safe-mode" role="alert" aria-live="polite">
      <div className="safe-mode-panel">
        <div className="safe-mode-title">Safe Mode</div>
        <p>
          Smart Maps OS booted into Safe Mode. The map, navigation and AI
          services are disabled while we recover from a previous crash.
        </p>
        <p>Choose how to continue:</p>
        <div className="safe-mode-actions">
          <button type="button" className="primary" onClick={onExit}>
            Exit Safe Mode
          </button>
          <button type="button" onClick={onReset}>
            Reset all data &amp; reload
          </button>
        </div>
      </div>
    </div>
  );
}
