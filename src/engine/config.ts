export const ENGINE_CONFIG = {
  // OpenFreeMap "liberty" — keyless OpenMapTiles-schema vector tiles. Building polygons
  // ship in the "building" source-layer so we can extrude them in 3D without an API key.
  styleUrl: 'https://tiles.openfreemap.org/styles/liberty',

  // AWS public terrain DEM (terrarium encoding). Keyless, global coverage, works with MapLibre's
  // `raster-dem` source. Required for the 3D mountains around Navagio / Zakynthos.
  terrain: {
    tileUrl: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    tileSize: 256,
    encoding: 'terrarium' as const,
    maxzoom: 14,
    exaggeration: 1.35
  },

  attribution:
    '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · AWS Open Terrain'
};
