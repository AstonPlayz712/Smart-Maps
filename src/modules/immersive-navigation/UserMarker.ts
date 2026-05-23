import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl';
import type { LatLng } from '../../engine/types';

export const USER_MARKER_IMAGE_ID = 'sm-user-arrow';
export const USER_MARKER_SOURCE = 'sm-user-position';
export const USER_MARKER_GLOW_LAYER = 'sm-user-glow';
export const USER_MARKER_LAYER = 'sm-user-arrow-layer';

// Glass-shard position marker: a sharp faceted chevron with an internal
// highlight, drawn in cyan-to-teal so it reads as glass-on-map rather than
// a cartoonish blob.
const ARROW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><defs><linearGradient id="shard" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E5FCFF" stop-opacity="1"/><stop offset="0.45" stop-color="#00E5FF" stop-opacity="0.95"/><stop offset="1" stop-color="#0096A8" stop-opacity="0.85"/></linearGradient></defs><path d="M24 4 L34 32 L24 26 L14 32 Z" fill="url(#shard)" stroke="#FFFFFF" stroke-width="0.9" stroke-linejoin="round"/><path d="M24 4 L24 26" stroke="#FFFFFF" stroke-width="0.6" stroke-opacity="0.55" stroke-linecap="round"/></svg>`;

/**
 * UserMarker — sharp cyan arrow with a soft underglow at the user's live
 * position. The arrow is map-aligned and rotated to the current heading;
 * combined with the predictive IN camera, this means the arrow always points
 * "up" on screen as you travel.
 *
 * No bounce, no wobble — just a position update each fix, eased by MapLibre's
 * default tile transition.
 */
export class UserMarker {
  private ready = false;
  private heading = 0;

  constructor(private map: MlMap) {}

  async init(): Promise<void> {
    if (this.ready) return;
    await this.loadArrowImage();
    this.ensureLayers();
    this.ready = true;
  }

  setPosition(loc: LatLng, headingDeg?: number | null): void {
    if (!this.ready) return;
    if (typeof headingDeg === 'number' && !Number.isNaN(headingDeg)) {
      this.heading = headingDeg;
    }
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { heading: this.heading },
          geometry: { type: 'Point', coordinates: [loc.lng, loc.lat] }
        }
      ]
    };
    (this.map.getSource(USER_MARKER_SOURCE) as GeoJSONSource | undefined)?.setData(fc);
  }

  hide(): void {
    if (!this.ready) return;
    const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
    (this.map.getSource(USER_MARKER_SOURCE) as GeoJSONSource | undefined)?.setData(empty);
  }

  private async loadArrowImage(): Promise<void> {
    if (this.map.hasImage(USER_MARKER_IMAGE_ID)) return;
    const url = 'data:image/svg+xml;utf8,' + encodeURIComponent(ARROW_SVG);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.width = 48;
      el.height = 48;
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    if (!this.map.hasImage(USER_MARKER_IMAGE_ID)) {
      this.map.addImage(USER_MARKER_IMAGE_ID, img, { pixelRatio: 2 });
    }
  }

  private ensureLayers(): void {
    if (!this.map.getSource(USER_MARKER_SOURCE)) {
      this.map.addSource(USER_MARKER_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
    }
    if (!this.map.getLayer(USER_MARKER_GLOW_LAYER)) {
      this.map.addLayer({
        id: USER_MARKER_GLOW_LAYER,
        type: 'circle',
        source: USER_MARKER_SOURCE,
        paint: {
          'circle-radius': 16,
          'circle-color': '#00E5FF',
          'circle-opacity': 0.18,
          'circle-blur': 0.7
        }
      });
    }
    if (!this.map.getLayer(USER_MARKER_LAYER)) {
      this.map.addLayer({
        id: USER_MARKER_LAYER,
        type: 'symbol',
        source: USER_MARKER_SOURCE,
        layout: {
          'icon-image': USER_MARKER_IMAGE_ID,
          'icon-size': 0.55,
          'icon-rotate': ['get', 'heading'],
          'icon-rotation-alignment': 'map',
          'icon-pitch-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true
        }
      });
    }
  }
}
