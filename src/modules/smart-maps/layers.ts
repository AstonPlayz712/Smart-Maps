import type { Map as MlMap } from 'maplibre-gl';

export const BUILDING_LAYER_ID = 'sm-3d-buildings';
export const SKY_LAYER_ID = 'sm-sky';

/**
 * Extrudes 3D buildings from the OpenMapTiles `building` source-layer that ships
 * with the OpenFreeMap "liberty" style.
 *
 * We pick the first vector source on the map dynamically so the renderer is not
 * coupled to a specific source id ("openmaptiles", "protomaps", etc).
 */
export function extrude3DBuildings(map: MlMap): void {
  if (map.getLayer(BUILDING_LAYER_ID)) return;

  const sources = map.getStyle().sources ?? {};
  const vectorSourceId = Object.keys(sources).find(
    (id) => (sources as Record<string, { type?: string }>)[id]?.type === 'vector'
  );
  if (!vectorSourceId) return;

  // Drop the extrusion *under* labels so road names and POI text stay readable.
  const layers = map.getStyle().layers ?? [];
  const firstSymbol = layers.find((l) => l.type === 'symbol')?.id;

  map.addLayer(
    {
      id: BUILDING_LAYER_ID,
      source: vectorSourceId,
      'source-layer': 'building',
      type: 'fill-extrusion',
      minzoom: 13,
      paint: {
        'fill-extrusion-color': [
          'interpolate',
          ['linear'],
          ['coalesce', ['get', 'render_height'], ['get', 'height'], 10],
          0, '#1c2438',
          12, '#27314b',
          40, '#3a4666',
          120, '#6c7da3',
          240, '#9fb1da'
        ],
        'fill-extrusion-height': [
          'interpolate',
          ['linear'],
          ['zoom'],
          13, 0,
          15.5, ['coalesce', ['get', 'render_height'], ['get', 'height'], 10]
        ],
        'fill-extrusion-base': [
          'coalesce',
          ['get', 'render_min_height'],
          ['get', 'min_height'],
          0
        ],
        'fill-extrusion-opacity': 0.92
      }
    },
    firstSymbol
  );
}

/** Atmospheric sky layer — gives 3D pitches a horizon instead of grey void. */
export function addSkyLayer(map: MlMap): void {
  if (map.getLayer(SKY_LAYER_ID)) return;
  try {
    // The `sky` layer is supported at runtime in MapLibre 4.x but absent from the type defs;
    // cast through so the TypeScript layer-type union doesn't reject it.
    map.addLayer({
      id: SKY_LAYER_ID,
      type: 'sky',
      paint: {
        'sky-color': '#7bb6ff',
        'sky-horizon-blend': 0.5,
        'horizon-color': '#cfe5ff',
        'horizon-fog-blend': 0.6,
        'fog-color': '#dbe9ff',
        'fog-ground-blend': 0.0
      }
    } as unknown as Parameters<MlMap['addLayer']>[0]);
  } catch (err) {
    // Some MapLibre builds gate the sky layer behind a feature flag — non-fatal.
    console.warn('[SmartMaps] sky layer unavailable', err);
  }
}
