import { seeded } from '../audio/schedule.ts';

/** Repeat the visual motion only. The game server supplies every face and total. */
export function throwRandom(key: string): () => number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return seeded(hash);
}
