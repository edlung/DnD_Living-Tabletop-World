import type { CampaignGenerationCandidate } from '@ltw/contracts';

import { digest } from '../workshop/generation/postgres-rows.ts';
import type {
  GenerationJobScope,
  StoredGenerationJob,
  StoredGenerationStep,
} from '../workshop/generation/store.ts';
import type { MemoryWorkshopStore } from './workshop-store.ts';

export type Mutable<T> = { -readonly [K in keyof T]: T[K] };
export const clone = <T>(value: T): T => structuredClone(value);
export { digest };
export const generationKey = (scope: GenerationJobScope) =>
  `${scope.ownerId}/${scope.draftId}/${scope.jobId}`;
interface State {
  jobs: Map<string, Mutable<StoredGenerationJob>>;
  steps: Map<string, Map<number, Mutable<StoredGenerationStep>>>;
  candidates: Map<string, CampaignGenerationCandidate>;
  nonces: Map<string, { fingerprint: string; scope: GenerationJobScope }>;
  tail: Promise<void>;
}
const states = new WeakMap<MemoryWorkshopStore, State>();
export function generationState(store: MemoryWorkshopStore): State {
  let state = states.get(store);
  if (!state) {
    state = {
      jobs: new Map(),
      steps: new Map(),
      candidates: new Map(),
      nonces: new Map(),
      tail: Promise.resolve(),
    };
    states.set(store, state);
  }
  return state;
}
export async function generationAtomic<T>(state: State, work: () => T | Promise<T>): Promise<T> {
  const before = state.tail;
  let unlock: () => void = () => undefined;
  state.tail = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  await before;
  try {
    return await work();
  } finally {
    unlock();
  }
}
