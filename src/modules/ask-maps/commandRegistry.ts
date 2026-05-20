import type { SmartMapsEngine } from '../../engine/SmartMapsEngine';
import type { NavigationService } from '../../services/NavigationService';
import { POIS } from '../../data/pois';
import { LOCATIONS } from '../smart-maps/locations';
import type { CameraPose } from '../../engine/types';

export interface CommandContext {
  engine: SmartMapsEngine;
  /**
   * The navigation service is the only path commands may take for routing /
   * destination / location work. Direct engine.navigation usage for navigation
   * state is forbidden — go through the service.
   */
  navigationService: NavigationService;
  query: string;
  match?: RegExpMatchArray;
}

export interface CommandDef {
  id: string;
  description: string;
  examples: string[];
  patterns: RegExp[];
  run(ctx: CommandContext): Promise<string | void> | string | void;
}

function findPOI(name: string) {
  const needle = name.toLowerCase().trim();
  if (!needle) return undefined;
  return (
    POIS.find((p) => p.name.toLowerCase() === needle) ??
    POIS.find((p) => p.id === needle) ??
    POIS.find((p) => p.name.toLowerCase().includes(needle))
  );
}

function findLocation(name: string) {
  const needle = name.toLowerCase().trim();
  return Object.values(LOCATIONS).find(
    (l) => l.name.toLowerCase() === needle || needle.includes(l.name.toLowerCase())
  );
}

export const COMMANDS: CommandDef[] = [
  {
    id: 'fly-to',
    description: 'Fly the camera to a place or POI',
    examples: ['fly to London Eye', 'go to Big Ben', 'take me to Navagio'],
    patterns: [/^(?:fly|go|take me|navigate|jump|warp)\s+(?:to|over to)\s+(.+)$/i],
    run({ engine, match }) {
      const target = match?.[1]?.trim();
      if (!target) return 'I need a destination.';
      const loc = findLocation(target);
      if (loc) {
        engine.goToLocation(loc.id);
        return `Flying to ${loc.name}`;
      }
      const poi = findPOI(target);
      if (poi) {
        engine.navigation.flyToPoint(poi.center, { zoom: 16.6, pitch: 66, duration: 2400 });
        return `Flying to ${poi.name}`;
      }
      return `I couldn't find "${target}".`;
    }
  },
  {
    id: 'orbit',
    description: 'Cinematically orbit around a place',
    examples: ['orbit Tower Bridge', 'orbit around Navagio'],
    patterns: [/^orbit(?:\s+around)?\s+(.+)$/i],
    run({ engine, match }) {
      const target = match?.[1]?.trim() ?? '';
      const poi = findPOI(target);
      if (!poi) return `I couldn't find "${target}" to orbit.`;
      engine.navigation.orbit(poi.center, 70);
      return `Orbiting ${poi.name}. Say "stop" to end the orbit.`;
    }
  },
  {
    id: 'stop',
    description: 'Stop active camera motion',
    examples: ['stop', 'stop orbit', 'end tour'],
    patterns: [/^(?:stop|halt|cancel|end)(?:\s+orbit|\s+tour)?$/i],
    run({ engine }) {
      engine.navigation.stopOrbit();
      engine.navigation.stopTour();
      return 'Camera stopped.';
    }
  },
  {
    id: 'tour',
    description: 'Run a cinematic tour of the current city',
    examples: ['cinematic tour', 'tour London', 'tour Zante'],
    patterns: [/^(?:cinematic\s+)?tour(?:\s+(.+))?$/i],
    run({ engine, match }) {
      const explicit = match?.[1]?.trim().toLowerCase();
      const cityId =
        explicit === 'zante' || explicit === 'zakynthos'
          ? ('zante' as const)
          : explicit === 'london'
            ? ('london' as const)
            : engine.getLocationId();

      const tourPoses: CameraPose[] = engine
        .getPOIs()
        .filter((p) => p.category === cityId)
        .slice(0, 5)
        .map((p, i) => ({
          center: p.center,
          zoom: 16.4,
          pitch: 68,
          bearing: (i * 72) % 360
        }));

      if (tourPoses.length === 0) return 'No tour stops available here.';
      engine.navigation.tour(tourPoses);
      return `Starting cinematic tour (${tourPoses.length} stops). Say "stop" to end it.`;
    }
  },
  {
    id: 'route',
    description: 'Route from your location to a POI',
    examples: ['route to Big Ben', 'directions to Tower Bridge'],
    patterns: [/^(?:route|navigate|directions?)\s+(?:to|toward(?:s)?)\s+(.+)$/i],
    run({ navigationService, match }) {
      const target = match?.[1]?.trim() ?? '';
      const poi = findPOI(target);
      if (!poi) return `I couldn't find "${target}" to route to.`;
      navigationService.startNavigation({ lng: poi.center[0], lat: poi.center[1] });
      return `Routing to ${poi.name}.`;
    }
  },
  {
    id: 'clear-route',
    description: 'Clear the current route',
    examples: ['clear route', 'cancel route'],
    patterns: [/^(?:clear|cancel|remove|hide)\s+route$/i],
    run({ navigationService }) {
      navigationService.stopNavigation();
      return 'Route cleared.';
    }
  },
  {
    id: 'show-buildings',
    description: 'Toggle 3D buildings',
    examples: ['show 3D buildings', 'hide buildings', 'toggle buildings'],
    patterns: [/^(show|hide|enable|disable|toggle)\s+(?:3d\s+)?buildings?$/i],
    run({ engine, match }) {
      const verb = match?.[1]?.toLowerCase();
      if (verb === 'toggle') {
        const exists = !!engine.getMap()?.getLayer('sm-3d-buildings');
        engine.renderer.enable3DBuildings(!exists);
        return exists ? '3D buildings off.' : '3D buildings on.';
      }
      const on = verb === 'show' || verb === 'enable';
      engine.renderer.enable3DBuildings(on);
      return on ? '3D buildings on.' : '3D buildings off.';
    }
  },
  {
    id: 'show-terrain',
    description: 'Toggle 3D terrain',
    examples: ['show terrain', 'hide terrain'],
    patterns: [/^(show|hide|enable|disable|toggle)\s+terrain$/i],
    run({ engine, match }) {
      const verb = match?.[1]?.toLowerCase();
      if (verb === 'toggle') {
        const t = engine.getMap()?.getTerrain();
        engine.renderer.enableTerrain(!t);
        return t ? 'Terrain off.' : 'Terrain on.';
      }
      const on = verb === 'show' || verb === 'enable';
      engine.renderer.enableTerrain(on);
      return on ? 'Terrain on.' : 'Terrain off.';
    }
  },
  {
    id: 'pitch-tilt',
    description: 'Tilt the camera (degrees, or "flat" / "cinematic")',
    examples: ['pitch 70', 'tilt to 80', 'flat', 'cinematic'],
    patterns: [
      /^(?:pitch|tilt)\s+(?:to\s+)?(\d{1,2}(?:\.\d+)?)\s*°?$/i,
      /^(flat|top[\s-]?down)$/i,
      /^(cinematic|tilted)$/i
    ],
    run({ engine, query, match }) {
      const map = engine.getMap();
      if (!map) return;
      if (/^(flat|top[\s-]?down)$/i.test(query.trim())) {
        map.easeTo({ pitch: 0, duration: 1200 });
        return 'Camera flattened.';
      }
      if (/^(cinematic|tilted)$/i.test(query.trim())) {
        map.easeTo({ pitch: 68, duration: 1400 });
        return 'Cinematic pitch.';
      }
      const value = Number(match?.[1] ?? 60);
      map.easeTo({ pitch: Math.max(0, Math.min(85, value)), duration: 1000 });
      return `Pitch set to ${value}°.`;
    }
  },
  {
    id: 'zoom',
    description: 'Zoom in / out, or to a specific level',
    examples: ['zoom in', 'zoom out', 'zoom 16'],
    patterns: [/^zoom(?:\s+(in|out|to)?\s*(\d{1,2}(?:\.\d+)?)?)?$/i],
    run({ engine, match }) {
      const map = engine.getMap();
      if (!map) return;
      const cmd = match?.[1]?.toLowerCase();
      const raw = match?.[2];
      if (raw != null && raw !== '') {
        const z = Math.max(0, Math.min(20, Number(raw)));
        map.easeTo({ zoom: z, duration: 900 });
        return `Zoom ${z}.`;
      }
      if (cmd === 'out') {
        map.easeTo({ zoom: Math.max(2, map.getZoom() - 1.5), duration: 700 });
        return 'Zooming out.';
      }
      map.easeTo({ zoom: Math.min(20, map.getZoom() + 1.5), duration: 700 });
      return 'Zooming in.';
    }
  },
  {
    id: 'time-mood',
    description: 'Change the time-of-day mood',
    examples: ['set time to dusk', 'night mode', 'day mode'],
    patterns: [/^(?:set\s+)?(?:time\s+(?:to|of)\s+)?(day|dusk|night)(?:\s+mode)?$/i],
    run({ engine, match }) {
      const mode = (match?.[1] ?? 'day').toLowerCase() as 'day' | 'dusk' | 'night';
      engine.renderer.setStyleMode(mode);
      return `Mood: ${mode}.`;
    }
  },
  {
    id: 'reset',
    description: 'Reset camera to a level look',
    examples: ['reset', 'reset camera', 'north up'],
    patterns: [/^(?:reset(?:\s+camera)?|north\s+up)$/i],
    run({ engine }) {
      const map = engine.getMap();
      map?.easeTo({ bearing: 0, pitch: 60, duration: 900 });
      return 'Camera reset.';
    }
  },
  {
    id: 'help',
    description: 'List available commands',
    examples: ['help', 'what can you do', '?'],
    patterns: [/^(?:help|commands|what can you do|\?)$/i],
    run() {
      return 'Try: fly to London Eye · orbit Tower Bridge · route to Big Ben · show 3D buildings · cinematic tour · night mode';
    }
  }
];
