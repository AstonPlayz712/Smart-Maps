import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl';
import type { EventBus } from '../../engine/EventBus';
import type { EngineEvents, LatLng } from '../../engine/types';

const ROUTE_SOURCE = 'sm-route';
const DEST_SOURCE = 'sm-route-dest';
const ROUTE_LAYER = 'sm-route-line';
const ROUTE_GLOW = 'sm-route-glow';
const DEST_RING = 'sm-route-dest-ring';
const DEST_DOT = 'sm-route-dest-dot';

const BASE_CORE_WIDTH = 4;
const BASE_GLOW_WIDTH = 14;
const JUNCTION_MULTIPLIER = 1.1;
const TRANSITION_MS = 300;

/**
 * Route polyline + destination marker. Styled in the Tesla register:
 *   • Electric cyan core   (#00E5FF), crisp, thin
 *   • Soft white halo      outer glow, low opacity, gentle blur
 *   • Destination          small flat ring + dot, no shadows
 *
 * On junction approach (NavigationService flips the flag when remaining
 * distance < 60 m) the line widens by 10 % via a 300 ms paint transition —
 * no bounce, no overshoot.
 */
export class RouteEngine {
  private origin: LatLng | null = null;
  private path: LatLng[] = [];
  private junctionMode = false;

  constructor(private map: MlMap, private bus: EventBus<EngineEvents>) {
    this.ensureLayers();
  }

  setUserLocation(p: LatLng): void {
    this.origin = p;
  }

  getOrigin(): LatLng | null {
    return this.origin;
  }

  getPath(): LatLng[] {
    return this.path.slice();
  }

  async routeTo(to: LatLng, from?: LatLng): Promise<void> {
    const start = from ?? this.origin ?? this.fallbackOrigin();
    this.origin = start;
    this.bus.emit('route:start', { from: start, to });

    this.path = this.buildPath(start, to);
    this.renderPath(this.path, to);

    const distanceMeters = this.haversine(start, to);
    const durationSec = distanceMeters / 1.4;
    this.bus.emit('route:done', { distanceMeters, durationSec });
  }

  clear(): void {
    const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
    (this.map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined)?.setData(empty);
    (this.map.getSource(DEST_SOURCE) as GeoJSONSource | undefined)?.setData(empty);
    this.path = [];
    this.setJunctionMode(false);
    this.bus.emit('route:clear', undefined);
  }

  setJunctionMode(on: boolean): void {
    if (this.junctionMode === on) return;
    this.junctionMode = on;
    const core = on ? BASE_CORE_WIDTH * JUNCTION_MULTIPLIER : BASE_CORE_WIDTH;
    const glow = on ? BASE_GLOW_WIDTH * JUNCTION_MULTIPLIER : BASE_GLOW_WIDTH;
    if (this.map.getLayer(ROUTE_LAYER)) {
      this.map.setPaintProperty(ROUTE_LAYER, 'line-width', core);
    }
    if (this.map.getLayer(ROUTE_GLOW)) {
      this.map.setPaintProperty(ROUTE_GLOW, 'line-width', glow);
    }
  }

  private fallbackOrigin(): LatLng {
    const c = this.map.getCenter();
    return { lng: c.lng, lat: c.lat };
  }

  private buildPath(a: LatLng, b: LatLng): LatLng[] {
    const steps = 64;
    const out: LatLng[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      out.push({
        lng: a.lng + (b.lng - a.lng) * t,
        lat: a.lat + (b.lat - a.lat) * t
      });
    }
    return out;
  }

  private renderPath(path: LatLng[], destination: LatLng): void {
    const lineFc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: path.map((p) => [p.lng, p.lat]) }
        }
      ]
    };
    const destFc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [destination.lng, destination.lat] }
        }
      ]
    };

    (this.map.getSource(ROUTE_SOURCE) as GeoJSONSource).setData(lineFc);
    (this.map.getSource(DEST_SOURCE) as GeoJSONSource).setData(destFc);
  }

  private ensureLayers(): void {
    if (!this.map.getSource(ROUTE_SOURCE)) {
      this.map.addSource(ROUTE_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
    }
    if (!this.map.getSource(DEST_SOURCE)) {
      this.map.addSource(DEST_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
    }
    // Soft white halo
    if (!this.map.getLayer(ROUTE_GLOW)) {
      this.map.addLayer({
        id: ROUTE_GLOW,
        type: 'line',
        source: ROUTE_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#FFFFFF',
          'line-width': BASE_GLOW_WIDTH,
          'line-opacity': 0.18,
          'line-blur': 4
        }
      });
      // Smooth (300 ms) width transitions for junction widening — no overshoot.
      this.map.setPaintProperty(ROUTE_GLOW, 'line-width-transition', {
        duration: TRANSITION_MS,
        delay: 0
      });
    }
    // Electric cyan core
    if (!this.map.getLayer(ROUTE_LAYER)) {
      this.map.addLayer({
        id: ROUTE_LAYER,
        type: 'line',
        source: ROUTE_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#00E5FF',
          'line-width': BASE_CORE_WIDTH,
          'line-opacity': 0.96
        }
      });
      this.map.setPaintProperty(ROUTE_LAYER, 'line-width-transition', {
        duration: TRANSITION_MS,
        delay: 0
      });
    }
    // Destination — flat ring + small dot
    if (!this.map.getLayer(DEST_RING)) {
      this.map.addLayer({
        id: DEST_RING,
        type: 'circle',
        source: DEST_SOURCE,
        paint: {
          'circle-radius': 9,
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': '#00E5FF',
          'circle-stroke-width': 1.5
        }
      });
    }
    if (!this.map.getLayer(DEST_DOT)) {
      this.map.addLayer({
        id: DEST_DOT,
        type: 'circle',
        source: DEST_SOURCE,
        paint: {
          'circle-radius': 3.5,
          'circle-color': '#FFFFFF'
        }
      });
    }
  }

  private haversine(a: LatLng, b: LatLng): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
}
