export type CharacterId = 'sonic' | 'tails' | 'knuckles' | 'amy';

export type VoiceEvent =
  // Distance / progress
  | 'nav.start'
  | 'distance.approach'
  // Turns
  | 'turn.left'
  | 'turn.right'
  | 'turn.left.onto'
  | 'turn.right.onto'
  | 'continue.straight'
  | 'keep.left'
  | 'keep.right'
  // Roundabouts
  | 'roundabout.enter'
  | 'roundabout.exit'
  // Highway
  | 'highway.merge'
  | 'highway.exit'
  | 'lane.guidance'
  // Long-distance guidance
  | 'long.distance'
  // Re-routing
  | 'recalculation'
  // Arrival
  | 'arrival.near'
  | 'arrival.destination'
  // Hazards
  | 'hazard.traffic'
  | 'hazard.camera'
  | 'hazard.roadworks'
  // IN reactions — rare, state-change driven
  | 'in.junction.approach'
  | 'in.curve.anticipation'
  | 'in.lane.alignment'
  | 'in.zoom.out';

export interface VoiceProfile {
  rate: number;
  pitch: number;
  volume: number;
  lang: string;
}

export interface Voicepack {
  id: CharacterId;
  displayName: string;
  tagline: string;
  voice: VoiceProfile;
  events: Partial<Record<VoiceEvent, string[]>>;
}

export interface VoiceContext {
  distance?: string;
  street?: string;
  road?: string;
  exit?: string;
  lane?: string;
}
