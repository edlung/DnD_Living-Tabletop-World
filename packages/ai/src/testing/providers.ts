import type { AiProvider, ProviderRequest } from '../providers.ts';

/**
 * Test support: a provider that plays back a script, one step per call, and
 * records every request it received. A step is an output, or an Error to throw.
 */
export interface ScriptedProvider extends AiProvider {
  readonly requests: ProviderRequest[];
}

export function scripted(id: string, ...steps: unknown[]): ScriptedProvider {
  const requests: ProviderRequest[] = [];
  return {
    id,
    requests,
    generate: (request) => {
      requests.push(request);
      const step = steps.shift();
      if (step === undefined) return Promise.reject(new Error(`${id}: script exhausted`));
      if (step instanceof Error) return Promise.reject(step);
      return Promise.resolve({ output: step, model: `${id}-model`, usage: null });
    },
  };
}

/** A clock whose milliseconds advance by 5 per reading. */
export function steppingMs(): () => number {
  let now = 0;
  return () => (now += 5);
}
