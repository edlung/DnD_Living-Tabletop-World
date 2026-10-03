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

/** G02-H03: assign a new character to `dev-outsider`, who then acts; returns both command IDs. */
export async function assignAndAct(
  app: FastifyInstance,
  action: 'move' | 'hypothesis',
  prefix: string,
): Promise<{ assignmentId: string; actionId: string }> {
  const created = await post(app, TOKENS.dm, `${prefix}-guest`, {
    type: 'CreateEntity',
    entityId: 'guest-character',
    kind: 'character',
    name: 'Guest',
    existsSince: null,
  });
  if (created.body.status === 'rejected') throw new Error(created.body.code);
  const command =
    action === 'move'
      ? { type: 'EnterLocation', characterId: 'guest-character', locationId: 'market-square' }
      : {
          type: 'FormHypothesis',
          characterId: 'guest-character',
          scope: 'CHARACTER',
          statement: 'A private guess.',
          subjects: [],
        };
  const before = await post(app, TOKENS.outsider, `${prefix}-early`, command);
  if (before.status !== 404) throw new Error('an unassigned player must not be a campaign member');
  const assigned = await post(app, TOKENS.dm, `${prefix}-assign`, {
    type: 'AssignCharacter',
    characterId: 'guest-character',
    playerActorId: 'outsider',
  });
  const acted = await post(app, TOKENS.outsider, `${prefix}-act`, command);
  if (assigned.body.status === 'rejected' || acted.body.status === 'rejected') {
    throw new Error('assignment and action must be accepted');
  }
  return { assignmentId: assigned.body.commandId, actionId: acted.body.commandId };
}

/** G02-M01: disclose a remote place, enter it, and inspect it finding nothing. */
export async function emptyInspectionChain(
  app: FastifyInstance,
  prefix: string,
): Promise<{ revealId: string; moveId: string; inspectId: string }> {
  const steps: [string, string, Record<string, unknown>][] = [
    [
      TOKENS.dm,
      `${prefix}-place`,
      {
        type: 'CreateEntity',
        entityId: 'empty-remote',
        kind: 'location',
        name: 'Empty remote',
        existsSince: null,
        location: { type: 'site', parentId: null },
      },
    ],
    [
      TOKENS.dm,
      `${prefix}-reveal`,
      {
        type: 'AddKnowledge',
        knowledgeId: 'empty-route',
        scope: { kind: 'PARTY' },
        knowledgeType: 'FACT',
        statement: 'Known empty-remote',
        subjects: ['empty-remote'],
        knownSince: 36000,
      },
    ],
    [
      TOKENS.player,
      `${prefix}-move`,
      { type: 'EnterLocation', characterId: ELOWEN, locationId: 'empty-remote' },
    ],
    [
      TOKENS.player,
      `${prefix}-inspect`,
      { type: 'ExamineEntity', characterId: ELOWEN, entityId: 'empty-remote', method: 'inspect' },
    ],
  ];
  const ids: string[] = [];
  for (const [token, commandId, command] of steps) {
    const { body } = await post(app, token, commandId, command);
    if (body.status === 'rejected') throw new Error(`${commandId}: ${body.code}`);
    ids.push(body.commandId);
  }
  const [, revealId = '', moveId = '', inspectId = ''] = ids;
  return { revealId, moveId, inspectId };
}

/** Blockers named by a rejected undo (DM results keep details). */
export function blockersOf(body: CommandResult): string[] {
  if (body.status !== 'rejected' || body.code !== 'UNDO_UNSAFE') return [];
  return (body.details?.['blockers'] as { commandId: string }[]).map((b) => b.commandId);
}
