import { useEffect, useRef } from 'react';
import type { SmartMapsEngine } from '../engine/SmartMapsEngine';

interface Props {
  engine?: SmartMapsEngine;
}

export default function MapView({ engine }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current || !engine) return;
    engine.attach(containerRef.current);
  }, [engine]);

  return <div className="map" ref={containerRef} aria-label="Smart Maps 3D canvas" />;
}
