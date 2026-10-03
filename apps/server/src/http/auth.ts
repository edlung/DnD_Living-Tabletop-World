import { readFile } from 'node:fs/promises';

import { actorIdSchema } from '@ltw/contracts';
import type { Actor } from '@ltw/domain';
import { z } from 'zod';

/**
 * Request authentication (docs/adr/0009-http-api-and-dev-authentication.md).
 * The only source of the request's actor: never request bodies, query
 * parameters, or other headers. HTTP callers are always `user` actors.
 */
export interface Authenticator {
  authenticate(authorization: string | undefined): Actor | null;
}

/** Production until an authentication ADR exists: nobody is authenticated. */
export const disabledAuthenticator: Authenticator = { authenticate: () => null };

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

/** Development/test persona tokens; config refuses this mode in production. */
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
    authenticate(authorization) {
      if (authorization === undefined) return null;
      const token = BEARER.exec(authorization)?.[1];
      return token === undefined ? null : (byToken.get(token) ?? null);
    },
  };
}

export async function loadDevPersonaAuthenticator(path: string): Promise<Authenticator> {
  return devPersonaAuthenticator(personasSchema.parse(JSON.parse(await readFile(path, 'utf8'))));
}
