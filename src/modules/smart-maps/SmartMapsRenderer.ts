import maplibregl, { Map as MlMap } from 'maplibre-gl';
import type { EventBus } from '../../engine/EventBus';
import type { CameraPose, EngineEvents, StyleMode } from '../../engine/types';
import { ENGINE_CONFIG } from '../../engine/config';
import {
  BUILDING_LAYER_ID,
  SKY_LAYER_ID,
  addSkyLayer,
  extrude3DBuildings
} from './layers';

/**
 * Smart Maps module — the rendering surface of the engine.
 *
 * Wraps MapLibre and adds the 3D primitives the rest of the engine relies on:
 * terrain, fill-extruded buildings, and an atmospheric sky. All visual style
 * decisions live here; nothing else in the engine should touch MapLibre style.
 */
export class SmartMapsRenderer {
  private map?: MlMap;
  private currentMode: StyleMode = 'day';

  constructor(private bus: EventBus<EngineEvents>) {}

  create(container: HTMLElement, pose: CameraPose): MlMap {
    const map = new maplibregl.Map({
      container,
      style: ENGINE_CONFIG.styleUrl,
      center: pose.center,
      zoom: pose.zoom,
      pitch: pose.pitch,
      bearing: pose.bearing,
      maxPitch: 85,
      antialias: true,
      attributionControl: { compact: true, customAttribution: ENGINE_CONFIG.attribution }
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');

    map.on('move', () => {
      this.bus.emit('camera:move', {
        center: [map.getCenter().lng, map.getCenter().lat],
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing()
      });
    });

    this.map = map;
    return map;
  }

  enableTerrain(on: boolean): void {
    const map = this.requireMap();
    const sourceId = 'sm-terrain';
    if (on) {
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: 'raster-dem',
          tiles: [ENGINE_CONFIG.terrain.tileUrl],
          tileSize: ENGINE_CONFIG.terrain.tileSize,
          encoding: ENGINE_CONFIG.terrain.encoding,
          maxzoom: ENGINE_CONFIG.terrain.maxzoom,
          attribution: 'Terrain: AWS Open Terrain'
        });
      }
      map.setTerrain({ source: sourceId, exaggeration: ENGINE_CONFIG.terrain.exaggeration });
    } else {
      map.setTerrain(null);
    }
  }

  enable3DBuildings(on: boolean): void {
    const map = this.requireMap();
    if (on) {
      extrude3DBuildings(map);
    } else if (map.getLayer(BUILDING_LAYER_ID)) {
      map.removeLayer(BUILDING_LAYER_ID);
    }
  }

  enableSky(): void {
    addSkyLayer(this.requireMap());
  }

  setStyleMode(mode: StyleMode): void {
    const map = this.requireMap();
    this.currentMode = mode;

    const palette = {
      day: { sky: '#7bb6ff', horizon: '#cfe5ff', fog: '#dbe9ff', blend: 0.5 },
      dusk: { sky: '#3a2e5f', horizon: '#ff9a6c', fog: '#5b3d6a', blend: 0.45 },
      night: { sky: '#080d1c', horizon: '#1d2440', fog: '#0a0f1c', blend: 0.18 }
    }[mode];

    if (map.getLayer(SKY_LAYER_ID)) {
      map.setPaintProperty(SKY_LAYER_ID, 'sky-color', palette.sky);
      map.setPaintProperty(SKY_LAYER_ID, 'horizon-color', palette.horizon);
      map.setPaintProperty(SKY_LAYER_ID, 'fog-color', palette.fog);
      map.setPaintProperty(SKY_LAYER_ID, 'sky-horizon-blend', palette.blend);
    }

    if (map.getLayer(BUILDING_LAYER_ID)) {
      const buildingPalette = {
        day: ['#1c2438', '#27314b', '#3a4666', '#6c7da3', '#9fb1da'],
        dusk: ['#1a1429', '#2b1d3f', '#4a2f5e', '#7a4a7a', '#b06893'],
        night: ['#0d1322', '#141a2e', '#1c2540', '#2a3354', '#3d4972']
      }[mode];
      map.setPaintProperty(BUILDING_LAYER_ID, 'fill-extrusion-color', [
        'interpolate',
        ['linear'],
        ['coalesce', ['get', 'render_height'], ['get', 'height'], 10],
        0, buildingPalette[0],
        12, buildingPalette[1],
        40, buildingPalette[2],
        120, buildingPalette[3],
        240, buildingPalette[4]
      ]);
    }

    this.bus.emit('mode:change', mode);
  }

  getMode(): StyleMode {
    return this.currentMode;
  }

  private requireMap(): MlMap {
    if (!this.map) throw new Error('SmartMapsRenderer: map not initialized');
    return this.map;
  }
}
