import { randomUUID } from 'node:crypto';

import {
  campaignIdSchema,
  giveKeptHandoutSchema,
  keptHandoutSchema,
  randomTableSchema,
  resultOn,
  rollOnTableSchema,
  type DmLibraryResponse,
  type KeptHandoutView,
  type RandomTableView,
} from '@ltw/contracts';
import { knownEntityIds, resolvePerspective, type Actor, type WorldState } from '@ltw/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { dmState } from '../combat/prepared-encounters.ts';
import type { TableDependencies } from '../dice/roll-access.ts';
import { tableEntry } from '../dice/roll-access.ts';
import type { TableRollRecord } from '../dice/table-store.ts';
import type { DmDependencies } from '../dm/dm-routes.ts';
import {
  handoutRefused,
  handoutView,
  type HandoutDependencies,
} from '../handouts/handout-routes.ts';
import type { HandoutRecord } from '../handouts/handout-store.ts';
import { sendError } from '../http/errors.ts';
import { authenticate, parseInput, type RouteDependencies } from '../http/request-context.ts';
import type { LibraryKind, LibraryRecord } from './library-store.ts';

/**
 * The DM's library (docs/adr/0058-campaign-content.md §3–4) in the ADR 0009 order (401, 400, then
 * 404 for a non-member and 403 for anyone but the DM): handouts kept for later, written, changed,
 * deleted and given as any handout (ADR 0044 §5), staying in the library; random tables written,
 * changed, deleted and rolled — a table roll the server makes, for the DM alone or for the table,
 * its result named beside it. Nothing here touches the world.
 */
export interface LibraryRouteDependencies extends RouteDependencies {
  readonly dm: DmDependencies;
  readonly handouts: HandoutDependencies;
  readonly table: TableDependencies;
}

const params = z.object({ campaignId: campaignIdSchema }).strict();
const entryParams = z.object({ campaignId: campaignIdSchema, entryId: z.uuid() }).strict();
const empty = z.object({}).strict();

const handoutOf = (state: WorldState, record: LibraryRecord): KeptHandoutView | null =>
  record.kind !== 'handout'
    ? null
    : {
        entryId: record.entryId,
        title: record.body.title,
        text: record.body.text ?? null,
        picture:
          record.body.entityId === undefined
            ? null
            : {
                entityId: record.body.entityId,
                name: state.entities.get(record.body.entityId)?.name ?? null,
              },
        updatedAt: record.updatedAt,
        givenAt: record.givenAt,
      };

const tableOf = (record: LibraryRecord): RandomTableView | null =>
  record.kind !== 'table'
    ? null
    : { ...record.body, entryId: record.entryId, updatedAt: record.updatedAt };

export function registerLibraryRoutes(app: FastifyInstance, deps: LibraryRouteDependencies): void {
  const { library, clock } = deps.dm;

  /** The DM's own campaign and the input, or null after the error was sent. */
  const asDm = async <B>(
    request: FastifyRequest,
    reply: FastifyReply,
    schema: z.ZodType<B>,
  ): Promise<{
    actor: Actor;
    campaignId: string;
    entryId: string;
    state: WorldState;
    body: B;
  } | null> => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return null;
    const path = parseInput(entryParams, request.params, request, reply);
    if (!path) return null;
    const body = parseInput(schema, request.body ?? {}, request, reply);
    if (body === null) return null;
    const dm = await dmState(request, reply, deps, actor, path.campaignId);
    if (!dm) return null;
    return { actor, campaignId: path.campaignId, entryId: path.entryId, state: dm.state, body };
  };

  /** Writes an entry: 201 new, 200 changed; null at the campaign's limit or over another kind. */
  const write = async (record: LibraryRecord): Promise<200 | 201 | null> => {
    const known = (await library.get(record.campaignId, record.entryId)) !== null;
    return (await library.put(record)) === 'written' ? (known ? 200 : 201) : null;
  };

  const remove = (kind: LibraryKind) => async (request: FastifyRequest, reply: FastifyReply) => {
    const dm = await asDm(request, reply, empty);
    if (!dm) return reply;
    if (!(await library.delete(dm.campaignId, dm.entryId, kind)))
      return sendError(reply, request, 'NOT_FOUND');
    return reply.code(204).send();
  };

  app.get('/campaigns/:campaignId/dm/library', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(params, request.params, request, reply);
    if (!path) return reply;
    const dm = await dmState(request, reply, deps, actor, path.campaignId);
    if (!dm) return reply;
    const records = await library.list(path.campaignId);
    const body: DmLibraryResponse = {
      handouts: records.flatMap((record) => handoutOf(dm.state, record) ?? []),
      tables: records.flatMap((record) => tableOf(record) ?? []),
    };
    return reply.send(body);
  });

  app.post('/campaigns/:campaignId/dm/library/handouts/:entryId', async (request, reply) => {
    const dm = await asDm(request, reply, keptHandoutSchema);
    if (!dm) return reply;
    if (dm.body.entityId !== undefined && !dm.state.entities.has(dm.body.entityId)) {
      return sendError(reply, request, 'UNPROCESSABLE');
    }
    const record: LibraryRecord = {
      campaignId: dm.campaignId,
      entryId: dm.entryId,
      kind: 'handout',
      body: dm.body,
      updatedAt: clock.now(),
      givenAt: null,
    };
    const code = await write(record);
    if (code === null) return sendError(reply, request, 'CONFLICT');
    const stored = await library.get(dm.campaignId, dm.entryId);
    return reply.code(code).send({ handout: stored && handoutOf(dm.state, stored) });
  });

  app.post('/campaigns/:campaignId/dm/library/handouts/:entryId/delete', remove('handout'));

  // Given as any handout, to the party or one character's player; it stays in the library.
  app.post('/campaigns/:campaignId/dm/library/handouts/:entryId/give', async (request, reply) => {
    const dm = await asDm(request, reply, giveKeptHandoutSchema);
    if (!dm) return reply;
    const kept = await library.get(dm.campaignId, dm.entryId);
    if (kept?.kind !== 'handout') return sendError(reply, request, 'NOT_FOUND');
    const { actor, state } = dm;
    const handout = { ...kept.body, recipientId: dm.body.recipientId };
    if (handoutRefused(state, actor, handout)) return sendError(reply, request, 'UNPROCESSABLE');
    const at = deps.handouts.now();
    const record: HandoutRecord = {
      campaignId: dm.campaignId,
      handoutId: randomUUID(),
      recipientId: handout.recipientId ?? null,
      title: kept.body.title,
      text: kept.body.text ?? null,
      entityId: kept.body.entityId ?? null,
      at,
    };
    await deps.handouts.store.add(record);
    await library.given(dm.campaignId, dm.entryId, at);
    const view = resolvePerspective(state, actor, { kind: 'DM' });
    const known = view.ok ? knownEntityIds(state, view.perspective) : new Set<string>();
    return reply.code(201).send({ handout: handoutView(state, known, record) });
  });

  app.post('/campaigns/:campaignId/dm/library/tables/:entryId', async (request, reply) => {
    const dm = await asDm(request, reply, randomTableSchema);
    if (!dm) return reply;
    const record: LibraryRecord = {
      campaignId: dm.campaignId,
      entryId: dm.entryId,
      kind: 'table',
      body: dm.body,
      updatedAt: clock.now(),
      givenAt: null,
    };
    const code = await write(record);
    if (code === null) return sendError(reply, request, 'CONFLICT');
    return reply.code(code).send({ table: tableOf(record) });
  });

  app.post('/campaigns/:campaignId/dm/library/tables/:entryId/delete', remove('table'));

  // The server's die (ADR 0044's table roll), never the client's: hidden, the DM's alone.
  app.post('/campaigns/:campaignId/dm/library/tables/:entryId/roll', async (request, reply) => {
    const dm = await asDm(request, reply, rollOnTableSchema);
    if (!dm) return reply;
    const kept = await library.get(dm.campaignId, dm.entryId);
    if (kept?.kind !== 'table') return sendError(reply, request, 'NOT_FOUND');
    const { die, name } = kept.body;
    const face = deps.table.dice.roll(die);
    const result = resultOn(kept.body, face);
    if (!result) return sendError(reply, request, 'CONFLICT');
    const roll: TableRollRecord = {
      rollId: randomUUID(),
      campaignId: dm.campaignId,
      rollerId: null,
      subject: { kind: 'table', name, result: result.text },
      groups: [{ purpose: 'dice', dice: [{ sides: die, value: face }], modifier: 0, total: face }],
      hidden: dm.body.hidden,
      entered: false,
      audienceId: null,
      requestId: null,
      at: deps.table.now(),
    };
    await deps.table.store.addRoll(roll);
    return reply.code(201).send({ roll: tableEntry(roll, null) });
  });
}
