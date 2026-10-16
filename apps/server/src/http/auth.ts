import { readFile } from 'node:fs/promises';

import { actorIdSchema } from '@ltw/contracts';
import type { Actor } from '@ltw/domain';
import { z } from 'zod';

/**
 * Request authentication (docs/adr/0009-http-api-and-dev-authentication.md; production sign-in:
 * docs/adr/0036-production-sign-in.md). The only source of the request's actor: never request
 * bodies, query parameters, or other headers. HTTP callers are always `user` actors.
 */
export interface Credentials {
  /** The `Authorization` header: development personas only. */
  readonly authorization?: string | undefined;
  /** The `Cookie` header: the session cookie in invitation mode. */
  readonly cookie?: string | undefined;
}

export interface Principal {
  readonly actor: Actor;
  /**
   * The one campaign a session credential opens; null for development personas, whose actors
   * are decided per campaign by membership alone.
   */
  readonly campaignId: string | null;
}

export interface Authenticator {
  authenticate(credentials: Credentials): Promise<Principal | null>;
}

/** Production until an authentication mode is configured: nobody is authenticated. */
export const disabledAuthenticator: Authenticator = {
  authenticate: () => Promise.resolve(null),
};

const personasSchema = z.object({
  personas: z
    .array(
      z
        .object({
          token: z.string().regex(/^[A-Za-z0-9._~-]{8,200}$/),
          actorId: actorIdSchema,
          description: z.string(),
        })
        .strict(),
    )
    .min(1),
});

const BEARER = /^Bearer ([A-Za-z0-9._~-]{8,200})$/;

/** Development/test persona tokens; config refuses this mode in production. Cookies are ignored. */
export function devPersonaAuthenticator(personas: z.infer<typeof personasSchema>): Authenticator {
  const byToken = new Map<string, Actor>();
  const actors = new Set<string>();
  for (const persona of personas.personas) {
    if (byToken.has(persona.token) || actors.has(persona.actorId)) {
      throw new Error('Persona tokens and actors must be unique');
    }
    byToken.set(persona.token, { actorId: persona.actorId, kind: 'user' });
    actors.add(persona.actorId);
  }
  return {
    authenticate({ authorization }) {
      const token = authorization === undefined ? undefined : BEARER.exec(authorization)?.[1];
      const actor = token === undefined ? undefined : byToken.get(token);
      return Promise.resolve(actor ? { actor, campaignId: null } : null);
    },
  };
}

export async function loadDevPersonaAuthenticator(path: string): Promise<Authenticator> {
  return devPersonaAuthenticator(personasSchema.parse(JSON.parse(await readFile(path, 'utf8'))));
}

/**
 * The actor a principal is on a request for `requestedCampaign` (the route's raw `campaignId`).
 * A session opens only its own campaign: on any other it is an actor that no campaign can have
 * as a member (its ID fails the actor pattern every stored DM and roster entry matches), so
 * the request continues in the ADR 0009 order and ends in the same 404 as a non-member's.
 */
export function actorFor(principal: Principal, requestedCampaign: unknown): Actor {
  if (principal.campaignId === null || requestedCampaign === undefined) return principal.actor;
  return requestedCampaign === principal.campaignId ? principal.actor : ELSEWHERE;
}

const ELSEWHERE: Actor = Object.freeze({ actorId: '#session-of-another-campaign', kind: 'user' });
