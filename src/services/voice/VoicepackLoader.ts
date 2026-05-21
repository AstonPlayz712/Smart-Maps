import type { CharacterId, Voicepack } from './types';

import sonic from './voicepacks/sonic.json';
import tails from './voicepacks/tails.json';
import knuckles from './voicepacks/knuckles.json';
import amy from './voicepacks/amy.json';

const PACKS: Record<CharacterId, Voicepack> = {
  sonic: sonic as Voicepack,
  tails: tails as Voicepack,
  knuckles: knuckles as Voicepack,
  amy: amy as Voicepack
};

export const VOICEPACKS = PACKS;

export const VOICEPACK_IDS: CharacterId[] = ['sonic', 'tails', 'knuckles', 'amy'];

export function getVoicepack(id: CharacterId): Voicepack {
  return PACKS[id];
}

export function listVoicepacks(): Voicepack[] {
  return VOICEPACK_IDS.map((id) => PACKS[id]);
}
