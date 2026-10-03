import type { CommandResult } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';

import { TOKENS, get } from './ravenford-app.ts';

/**
 * Test support (excluded from builds): the Astra Gate 02 reproductions
 * (reviews/ASTRA_GATE_02_REPORT.md, G02-H01 and G02-H02) over the HTTP app,
 * shared by the in-memory and PostgreSQL regression suites.
 */
export const BASE = '/campaigns/ravenford';
export const ELOWEN = 'elowen-starwhisper';

export async function post(
  app: FastifyInstance,
  token: string,
  commandId: string,
  command: Record<string, unknown>,
): Promise<{ status: number; body: CommandResult }> {
  const response = await app.inject({
    method: 'POST',
    url: `${BASE}/commands`,
    headers: { authorization: `Bearer ${token}` },
    payload: { commandId, command },
  });
  return { status: response.statusCode, body: response.json<CommandResult>() };
}

/** G02-H01: a known room inside a location no perspective knows. */
export async function authorHiddenParent(app: FastifyInstance): Promise<void> {
  const commands: [string, Record<string, unknown>][] = [
    [
      'h01-vault',
      {
        type: 'CreateEntity',
        entityId: 'hidden-vault',
        kind: 'location',
        name: 'Secret vault',
        existsSince: null,
        location: { type: 'site', parentId: null },
      },
    ],
    [
      'h01-room',
      {
        type: 'CreateEntity',
        entityId: 'known-room',
        kind: 'location',
        name: 'A remembered room',
        existsSince: null,
        location: { type: 'room', parentId: 'hidden-vault' },
      },
    ],
    [
      'h01-memory',
      {
        type: 'RecordMemory',
        memoryId: 'room-memory',
        scope: { kind: 'PUBLIC' },
        memoryKind: 'DECISION',
        summary: 'A remembered room.',
        occurredAt: 0,
        locationId: 'known-room',
      },
    ],
  ];
  for (const [commandId, command] of commands) {
    const { body } = await post(app, TOKENS.dm, commandId, command);
    if (body.status === 'rejected') throw new Error(`${commandId}: ${body.code}`);
  }
}

export const H01_VIEWS: [string, string][] = [
  ['PUBLIC', TOKENS.player],
  ['PARTY', TOKENS.player],
  ['PLAYER', TOKENS.player],
  ['NPC:mira-vale', TOKENS.dm],
];

/** Status and body of a location-filtered recall, for exact comparison. */
export async function recallAt(
  app: FastifyInstance,
  perspective: string,
  token: string,
  location: string,
) {
  const response = await get(
    app,
    `${BASE}/memories?perspective=${perspective}&location=${location}&limit=50`,
    token,
  );
  return { status: response.statusCode, body: response.json<unknown>() };
}

/** G02-H02: disclose an unknown remote place, enter it, then try to undo the disclosure. */
export async function discloseAndEnter(
  app: FastifyInstance,
  kind: 'knowledge' | 'memory',
  prefix: string,
): Promise<{ disclosureId: string; moveId: string }> {
  const place = `remote-${kind}`;
  const created = await post(app, TOKENS.dm, `${prefix}-place`, {
    type: 'CreateEntity',
    entityId: place,
    kind: 'location',
    name: `Remote ${kind}`,
    existsSince: null,
    location: { type: 'site', parentId: null },
  });
  if (created.body.status === 'rejected') throw new Error(created.body.code);
  const blind = await post(app, TOKENS.player, `${prefix}-blind`, {
    type: 'EnterLocation',
    characterId: ELOWEN,
    locationId: place,
  });
  if (blind.body.status !== 'rejected' || blind.body.code !== 'ENTITY_NOT_FOUND') {
    throw new Error('the remote place must start unknown');
  }
  const disclosure =
    kind === 'knowledge'
      ? {
          type: 'AddKnowledge',
          knowledgeId: `${prefix}-disclosure`,
          scope: { kind: 'PARTY' },
          knowledgeType: 'FACT',
          statement: 'The remote place is known.',
          subjects: [place],
          knownSince: 36000,
        }
      : {
          type: 'RecordMemory',
          memoryId: `${prefix}-memory`,
          scope: { kind: 'PARTY' },
          memoryKind: 'DECISION',
          summary: 'We decided to remember the way.',
          occurredAt: 36000,
          locationId: place,
        };
  const disclosed = await post(app, TOKENS.dm, `${prefix}-reveal`, disclosure);
  const moved = await post(app, TOKENS.player, `${prefix}-move`, {
    type: 'EnterLocation',
    characterId: ELOWEN,
    locationId: place,
  });
  if (disclosed.body.status === 'rejected' || moved.body.status === 'rejected') {
    throw new Error('disclosure and move must be accepted');
  }
  return { disclosureId: disclosed.body.commandId, moveId: moved.body.commandId };
}
