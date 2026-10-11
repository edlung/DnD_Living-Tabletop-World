import type { FallbackAccounting } from '../fallback.ts';
import {
  branded,
  outputResponse,
  type AttemptContext,
  type DenialCode,
  type IntentTask,
  type MalformedCode,
  type ProviderKind,
  type ProviderPayload,
  type ProviderRequest,
  type ProviderResponse,
  type RoutedProvider,
  type SuspectCode,
} from '../providers.ts';

/**
 * Test support. `testBrand` is the only place a pure-package test makes a routable provider
 * from a fake: it has the router's brand, never server identity, so server composition rejects
 * it (docs/adr/0032-live-ai.md, B1). Production sources never import this module.
 */
export function testBrand(
  id: string,
  kind: ProviderKind,
  generate: (request: ProviderRequest, attempt: AttemptContext) => Promise<ProviderResponse>,
): RoutedProvider {
  return branded({ id, kind, generate });
}

/** A scripted step that answers with a whole classified response rather than an output. */
class Scripted {
  readonly response: (id: string) => ProviderResponse;

  constructor(response: (id: string) => ProviderResponse) {
    this.response = response;
  }
}

const facts = (id: string) => ({
  model: `${id}-model`,
  usage: { inputTokens: 10, outputTokens: 2 },
  billing: null,
  providerRequestId: null,
});

export const refusal = () => new Scripted((id) => ({ kind: 'refusal', ...facts(id) }));
export const malformed = (code: MalformedCode) =>
  new Scripted((id) => ({ kind: 'malformed', code, ...facts(id) }));
export const suspect = (code: SuspectCode) =>
  new Scripted((id) => ({ kind: 'suspect', code, ...facts(id) }));
export const denied = (code: DenialCode) => new Scripted(() => ({ kind: 'denied', code }));

/**
 * A provider that plays back a script, one step per call, and records every request it received.
 * A step is an output, a function of the request returning one, an Error to throw, or a classified
 * response (`refusal()`, `malformed()`, `suspect()`, `denied()`). Remote unless made with
 * `scriptedLocal`.
 */
export interface ScriptedProvider extends RoutedProvider {
  readonly requests: ProviderRequest[];
}

function script(id: string, kind: ProviderKind, steps: unknown[]): ScriptedProvider {
  const requests: ProviderRequest[] = [];
  const provider = testBrand(id, kind, (request, attempt) => {
    requests.push(request);
    const step = steps.shift();
    if (step === undefined) return Promise.reject(new Error(`${id}: script exhausted`));
    if (step instanceof Error) return Promise.reject(step);
    attempt.onStart();
    if (step instanceof Scripted) return Promise.resolve(step.response(id));
    const output: unknown =
      typeof step === 'function' ? (step as (request: ProviderRequest) => unknown)(request) : step;
    return Promise.resolve(outputResponse(output, `${id}-model`));
  });
  return Object.assign(provider, { requests });
}

export const scripted = (id: string, ...steps: unknown[]): ScriptedProvider =>
  script(id, 'remote', steps);

/** A zero-cost local stand-in, branded for tests only. */
export const scriptedLocal = (...steps: unknown[]): ScriptedProvider =>
  script('local', 'local', steps);

/** A clock whose milliseconds advance by 5 per reading. */
export function steppingMs(): () => number {
  let now = 0;
  return () => (now += 5);
}

/** The DM-intent task a request carried (tests read its context). */
export function intentTaskOf(request: ProviderRequest | undefined): IntentTask {
  if (request?.task.kind !== 'dm-intent') throw new Error('not a DM-intent request');
  return request.task;
}

/** An intent proposal in the tool's envelope. */
export const proposal = (value: unknown) => ({ kind: 'proposal', proposal: value });

/** A trusted accounting identity for direct fallback-policy tests: fresh attempt IDs per call. */
export function testAccounting(): FallbackAccounting {
  let attempts = 0;
  return {
    requestId: '00000000-0000-4000-8000-0000000000aa',
    campaignId: 'ravenford',
    capability: 'reasoning',
    sessionId: 'session-test',
    newAttemptId: () => `00000000-0000-4000-8000-${(attempts += 1).toString(16).padStart(12, '0')}`,
  };
}

/** What a provider may serialize: the request without its trusted accounting metadata. */
export function payloadOf(request: ProviderRequest | undefined): ProviderPayload | undefined {
  if (request === undefined) return undefined;
  const { capability, system, prompt, output, task } = request;
  return { capability, system, prompt, output, task };
}
