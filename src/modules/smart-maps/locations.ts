import type { CameraPose } from '../../engine/types';

export type LocationId = 'london' | 'zante';

export interface LocationDef {
  id: LocationId;
  name: string;
  description: string;
  pose: CameraPose;
}

export const LOCATIONS: Record<LocationId, LocationDef> = {
  london: {
    id: 'london',
    name: 'London',
    description: 'Westminster & the South Bank — dense 3D city core.',
    pose: {
      center: [-0.1245, 51.5007],
      zoom: 15.6,
      pitch: 64,
      bearing: -20
    }
  },
  zante: {
    id: 'zante',
    name: 'Zante',
    description: 'Zakynthos — Navagio coast, terrain-driven 3D landscape.',
    pose: {
      center: [20.6235, 37.859],
      zoom: 13.2,
      pitch: 72,
      bearing: 40
    }
  }
};
