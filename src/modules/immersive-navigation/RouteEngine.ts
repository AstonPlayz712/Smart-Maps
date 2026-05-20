import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl';
import type { EventBus } from '../../engine/EventBus';
import type { EngineEvents, LatLng } from '../../engine/types';

const ROUTE_SOURCE = 'sm-route';
const POINTS_SOURCE = 'sm-route-points';
const ROUTE_LAYER = 'sm-route-line';
const ROUTE_GLOW = 'sm-route-glow';
const POINTS_LAYER = 'sm-route-points-layer';

/**
 * RouteEngine renders a polyline from the user's location to a tapped/asked target,
 * emits distance/duration estimates, and exposes a `clear()` for tear-down.
 *
 * The path itself is a linear interpolation — good enough for the proto's cinematic
 * intent; swap `buildPath` for an OSRM/Valhalla call to graduate to street routing.
 */
export class RouteEngine {
  private origin: LatLng | null = null;

  constructor(private map: MlMap, private bus: EventBus<EngineEvents>) {
    this.ensureLayers();
  }

  setUserLocation(p: LatLng): void {
    this.origin = p;
  }

  getOrigin(): LatLng | null {
    return this.origin;
  }

  async routeTo(to: LatLng, from?: LatLng): Promise<void> {
    const start = from ?? this.origin ?? this.fallbackOrigin();
    this.origin = start;
    this.bus.emit('route:start', { from: start, to });

    const path = this.buildPath(start, to);
    this.renderPath(path, [start, to]);

    const distanceMeters = this.haversine(start, to);
    const durationSec = distanceMeters / 1.4; // ~ walking 1.4 m/s
    this.bus.emit('route:done', { distanceMeters, durationSec });
  }

  clear(): void {
    const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
    (this.map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined)?.setData(empty);
    (this.map.getSource(POINTS_SOURCE) as GeoJSONSource | undefined)?.setData(empty);
    this.bus.emit('route:clear', undefined);
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

  private renderPath(path: LatLng[], endpoints: LatLng[]): void {
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
    const pointFc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: endpoints.map((p, i) => ({
        type: 'Feature',
        properties: { kind: i === 0 ? 'origin' : 'destination' },
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] }
      }))
    };

    (this.map.getSource(ROUTE_SOURCE) as GeoJSONSource).setData(lineFc);
    (this.map.getSource(POINTS_SOURCE) as GeoJSONSource).setData(pointFc);
  }

  private ensureLayers(): void {
    if (!this.map.getSource(ROUTE_SOURCE)) {
      this.map.addSource(ROUTE_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
    }
    if (!this.map.getSource(POINTS_SOURCE)) {
      this.map.addSource(POINTS_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
    }
    if (!this.map.getLayer(ROUTE_GLOW)) {
      this.map.addLayer({
        id: ROUTE_GLOW,
        type: 'line',
        source: ROUTE_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#5cc8ff',
          'line-width': 14,
          'line-opacity': 0.18,
          'line-blur': 6
        }
      });
    }
    if (!this.map.getLayer(ROUTE_LAYER)) {
      this.map.addLayer({
        id: ROUTE_LAYER,
        type: 'line',
        source: ROUTE_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#9fdcff',
          'line-width': 4,
          'line-opacity': 0.95
        }
      });
    }
    if (!this.map.getLayer(POINTS_LAYER)) {
      this.map.addLayer({
        id: POINTS_LAYER,
        type: 'circle',
        source: POINTS_SOURCE,
        paint: {
          'circle-radius': 7,
          'circle-color': [
            'match',
            ['get', 'kind'],
            'origin', '#5cc8ff',
            'destination', '#b78bff',
            '#ffffff'
          ],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2
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
