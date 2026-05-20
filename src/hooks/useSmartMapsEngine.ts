import { useEffect, useRef, useState } from 'react';
import { SmartMapsEngine, type EngineOptions } from '../engine/SmartMapsEngine';

/**
 * Convenience hook for consumers that want the engine without managing the
 * "create once, attach later, detach on unmount" dance themselves. The main
 * App.tsx wires it manually, but this hook is the public-facing primitive
 * for any other React surface that wants to embed Smart Maps OS.
 */
export function useSmartMapsEngine(options: EngineOptions) {
  const engineRef = useRef<SmartMapsEngine | null>(null);
  const [ready, setReady] = useState(false);

  if (engineRef.current === null) {
    engineRef.current = new SmartMapsEngine({
      ...options,
      onReady: () => {
        setReady(true);
        options.onReady?.();
      }
    });
  }

  useEffect(() => {
    return () => {
      engineRef.current?.detach();
      engineRef.current = null;
    };
  }, []);

  return { engine: engineRef.current, ready };
}
