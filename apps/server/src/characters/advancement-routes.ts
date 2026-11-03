import {
  CLASS_IDS,
  awardExperienceRequestSchema,
  campaignIdSchema,
  entityIdSchema,
  levelUpChoicesSchema,
  type CharacterSheet,
  type LevelOptionsResponse,
  type LevelUpResponse,
} from '@ltw/contracts';
import {
  classIn,
  experienceFor,
  levelAsks,
  levelFeatures,
  levelUpCharacter,
  srdClass,
  totalLevel,
} from '@ltw/rules';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { TableDependencies } from '../dice/roll-access.ts';
import { sendError } from '../http/errors.ts';
import { withBody, withPerspective, type RouteDependencies } from '../http/request-context.ts';
import { TABLE_ACTOR } from '../rest/rest-routes.ts';

/**
 * Advancement (docs/adr/0056-characters-from-the-srd.md §3): the DM awards experience, divided
 * evenly among the characters named, or grants a level (a milestone); a character with the
 * experience for its next level, or a level granted, takes it with its player's choices — the
 * rules build the next sheet, the server rolls a rolled level's hit points, and the World Engine
 * records the sheet. The DM may take a level for any character.
 */
const params = z.object({ campaignId: campaignIdSchema }).strict();
const characterParams = z
  .object({ campaignId: campaignIdSchema, characterId: entityIdSchema })
  .strict();
const advanceBody = z.object({ requestId: z.uuid(), choices: levelUpChoicesSchema }).strict();
const milestoneBody = z.object({ requestId: z.uuid() }).strict();

/** The levels a sheet may take now: its experience's, or one the DM granted. */
export function levelReady(sheet: CharacterSheet): boolean {
  const next = totalLevel(sheet) + 1;
  return (
    next <= 20 && ((sheet.pendingLevels ?? 0) > 0 || (sheet.experience ?? 0) >= experienceFor(next))
  );
}

export function registerAdvancementRoutes(
  app: FastifyInstance,
  deps: RouteDependencies & { readonly table: TableDependencies },
): void {
  const record = async (campaignId: string, commandId: string, command: object) =>
    (await deps.engine.execute({ campaignId, commandId, actor: TABLE_ACTOR, command })).status !==
    'rejected';

  /** The DM, or the player of the character named. */
  const forCharacter = async <B>(
    request: FastifyRequest,
    reply: FastifyReply,
    body: z.ZodType<B>,
  ) => {
    const ready = await withBody(request, reply, deps, { params: characterParams, body });
    if (!ready) return null;
    const { perspective, state } = ready.context;
    const own =
      perspective.kind === 'CHARACTER' && perspective.holderId === ready.params.characterId;
    const sheet = state.characterSheets.get(ready.params.characterId);
    if ((perspective.kind !== 'DM' && !own) || !sheet) {
      await sendError(
        reply,
        request,
        perspective.kind !== 'DM' && !own ? 'FORBIDDEN' : 'NOT_FOUND',
      );
      return null;
    }
    return { ...ready, sheet, dm: perspective.kind === 'DM' };
  };

  app.post('/campaigns/:campaignId/experience', async (request, reply) => {
    const ready = await withBody(request, reply, deps, {
      params,
      body: awardExperienceRequestSchema,
    });
    if (!ready) return reply;
    if (ready.context.perspective.kind !== 'DM') return sendError(reply, request, 'FORBIDDEN');
    const { state } = ready.context;
    const { amount, characterIds, requestId } = ready.body;
    const sheets = characterIds.map((id) => [id, state.characterSheets.get(id)] as const);
    if (sheets.some(([, sheet]) => !sheet)) return sendError(reply, request, 'NOT_FOUND');
    // Divided evenly (SRD 5.2.1, Experience Points), what does not divide left over.
    const share = Math.floor(amount / characterIds.length);
    for (const [id, sheet] of sheets) {
      const commandId = `experience.${requestId}.${id}`;
      if (!sheet || state.commands.has(commandId)) continue;
      const next = { ...sheet, experience: (sheet.experience ?? 0) + share };
      if (
        !(await record(ready.params.campaignId, commandId, {
          type: 'SetCharacterSheet',
          entityId: id,
          sheet: next,
        }))
      )
        return sendError(reply, request, 'CONFLICT');
    }
    return reply.code(201).send({ share });
  });

  app.post('/campaigns/:campaignId/characters/:characterId/milestone', async (request, reply) => {
    const ready = await forCharacter(request, reply, milestoneBody);
    if (!ready) return reply;
    if (!ready.dm) return sendError(reply, request, 'FORBIDDEN');
    const commandId = `milestone.${ready.body.requestId}`;
    if (ready.context.state.commands.has(commandId)) return reply.send({ granted: true });
    const pending = (ready.sheet.pendingLevels ?? 0) + 1;
    if (totalLevel(ready.sheet) + pending > 20) return sendError(reply, request, 'UNPROCESSABLE');
    const next = { ...ready.sheet, pendingLevels: pending };
    const command = { type: 'SetCharacterSheet', entityId: ready.params.characterId, sheet: next };
    if (!(await record(ready.params.campaignId, commandId, command)))
      return sendError(reply, request, 'CONFLICT');
    return reply.code(201).send({ granted: true });
  });

  app.get(
    '/campaigns/:campaignId/characters/:characterId/level-options',
    async (request, reply) => {
      const ready = await withPerspective(request, reply, deps, {
        params: characterParams,
        query: z.object({ perspective: z.string() }).strict(),
      });
      if (!ready) return reply;
      const { perspective, state } = ready.context;
      const own =
        perspective.kind === 'CHARACTER' && perspective.holderId === ready.params.characterId;
      const sheet = state.characterSheets.get(ready.params.characterId);
      if (perspective.kind !== 'DM' && !own) return sendError(reply, request, 'FORBIDDEN');
      if (!sheet) return sendError(reply, request, 'NOT_FOUND');
      const language = state.campaign?.language === 'ru' ? 'ru' : 'en';
      const body: LevelOptionsResponse = {
        perspective: perspective.label,
        ready: levelReady(sheet) || perspective.kind === 'DM',
        level: totalLevel(sheet),
        experience: sheet.experience ?? 0,
        nextAt: experienceFor(totalLevel(sheet) + 1),
        pendingLevels: sheet.pendingLevels ?? 0,
        classes: CLASS_IDS.map((classId) => {
          const asks = levelAsks(sheet, classId);
          if (typeof asks === 'string') return { classId, refused: asks };
          // The rules read the SRD's English; the player reads the campaign's language.
          const english = srdClass(classId);
          const shown = english && classIn(english, language).value;
          if (!english || !shown) return { classId, asks };
          const features = levelFeatures(english, asks.classLevel, shown);
          const subclass = asks.subclass === null ? null : shown.subclass.name;
          return { classId, asks: { ...asks, features, subclass } };
        }),
      };
      return reply.send(body);
    },
  );

  app.post('/campaigns/:campaignId/characters/:characterId/advance', async (request, reply) => {
    const ready = await forCharacter(request, reply, advanceBody);
    if (!ready) return reply;
    const { sheet, dm } = ready;
    const commandId = `advance.${ready.body.requestId}`;
    if (ready.context.state.commands.has(commandId))
      return reply.send({ status: 'duplicate', problems: [] } satisfies LevelUpResponse);
    if (!dm && !levelReady(sheet)) return sendError(reply, request, 'CONFLICT');
    const built = levelUpCharacter(sheet, ready.body.choices, (sides) =>
      deps.table.dice.roll(sides),
    );
    if (!built.ok) {
      const refused: LevelUpResponse = { status: 'refused', problems: built.problems };
      return reply.code(422).send(refused);
    }
    // A granted level is taken first; experience stays as it is.
    const pending = (sheet.pendingLevels ?? 0) - 1;
    const next: CharacterSheet = { ...built.sheet };
    delete next.pendingLevels;
    if (pending > 0) next.pendingLevels = pending;
    const command = { type: 'SetCharacterSheet', entityId: ready.params.characterId, sheet: next };
    if (!(await record(ready.params.campaignId, commandId, command)))
      return sendError(reply, request, 'CONFLICT');
    return reply.code(201).send({ status: 'levelled', problems: [] } satisfies LevelUpResponse);
  });
}
