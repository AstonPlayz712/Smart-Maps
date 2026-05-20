import type { POI } from '../engine/types';

export const POIS: POI[] = [
  // London
  { id: 'london-eye', name: 'London Eye', center: [-0.1196, 51.5033], category: 'london' },
  { id: 'big-ben', name: 'Big Ben', center: [-0.1247, 51.5007], category: 'london' },
  { id: 'tower-bridge', name: 'Tower Bridge', center: [-0.0754, 51.5055], category: 'london' },
  { id: 'st-pauls', name: "St Paul's Cathedral", center: [-0.0984, 51.5138], category: 'london' },
  { id: 'shard', name: 'The Shard', center: [-0.0865, 51.5045], category: 'london' },
  { id: 'trafalgar', name: 'Trafalgar Square', center: [-0.1281, 51.508], category: 'london' },
  { id: 'buckingham', name: 'Buckingham Palace', center: [-0.1419, 51.5014], category: 'london' },

  // Zante / Zakynthos
  { id: 'navagio', name: 'Navagio Beach', center: [20.6235, 37.859], category: 'zante' },
  { id: 'blue-caves', name: 'Blue Caves', center: [20.677, 37.9255], category: 'zante' },
  { id: 'zakynthos-town', name: 'Zakynthos Town', center: [20.899, 37.787], category: 'zante' },
  { id: 'bohali', name: 'Bohali Viewpoint', center: [20.8854, 37.7948], category: 'zante' },
  { id: 'keri-caves', name: 'Keri Caves', center: [20.8132, 37.6688], category: 'zante' }
];
