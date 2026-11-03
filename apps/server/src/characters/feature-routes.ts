import {
  campaignIdSchema,
  entityIdSchema,
  type CharacterFeatureView,
  type CharacterFeaturesResponse,
  type CharacterSheet,
  type SrdClass,
} from '@ltw/contracts';
import { classIn, srdClass, type ReferenceLanguage } from '@ltw/rules';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { sendError } from '../http/errors.ts';
import { withPerspective, type RouteDependencies } from '../http/request-context.ts';

/**
 * A character's class features in words (docs/adr/0056-characters-from-the-srd.md §4): every
 * feature its class levels give it and its subclass's, in the campaign's language, with the
 * Metamagic options and invocations it chose beside the feature that chooses them. What the World
 * Engine does not apply is the DM's, read from these words. The DM or the character's player reads
 * them.
 */
const params = z.object({ campaignId: campaignIdSchema, characterId: entityIdSchema }).strict();
const query = z.object({ perspective: z.string() }).strict();

/** The features a class entry of the sheet gives, by level. */
function featuresOf(
  sheet: CharacterSheet,
  entry: CharacterSheet['classes'][number],
  english: SrdClass,
  language: ReferenceLanguage,
): CharacterFeatureView[] {
  const shown = classIn(english, language);
  const words = shown.value;
  const chosenIds = new Set([
    ...(sheet.classChoices?.metamagic ?? []),
    ...(sheet.classChoices?.invocations ?? []),
  ]);
  const chosen = (english.options?.entries ?? []).flatMap((option, index) => {
    const own = words.options?.entries[index] ?? option;
    return chosenIds.has(option.optionId) ? [{ name: own.name, blocks: own.blocks }] : [];
  });
  const view = (
    feature: SrdClass['features'][number],
    worded: SrdClass['features'][number] | undefined,
    subclass: boolean,
  ): CharacterFeatureView => ({
    classId: entry.classId,
    level: feature.level,
    name: worded?.name ?? feature.name,
    subclass,
    blocks: worded?.blocks ?? feature.blocks,
    language: shown.language,
    // The options it chose, beside the feature that chooses them.
    ...(chosen.length > 0 && /^(Metamagic|Eldritch Invocations)$/.test(feature.name)
      ? { chosen }
      : {}),
  });
  const own = english.features.flatMap((feature, index) =>
    feature.level <= entry.level ? [view(feature, words.features[index], false)] : [],
  );
  const sub = entry.subclass
    ? english.subclass.features.flatMap((feature, index) =>
        feature.level <= entry.level ? [view(feature, words.subclass.features[index], true)] : [],
      )
    : [];
  return [...own, ...sub].sort((a, b) => a.level - b.level);
}

export function registerFeatureRoutes(app: FastifyInstance, deps: RouteDependencies): void {
  app.get('/campaigns/:campaignId/characters/:characterId/features', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, { params, query });
    if (!ready) return reply;
    const { perspective, state } = ready.context;
    const own =
      perspective.kind === 'CHARACTER' && perspective.holderId === ready.params.characterId;
    if (perspective.kind !== 'DM' && !own) return sendError(reply, request, 'FORBIDDEN');
    const sheet = state.characterSheets.get(ready.params.characterId);
    if (!sheet) return sendError(reply, request, 'NOT_FOUND');
    const language = state.campaign?.language === 'ru' ? 'ru' : 'en';
    const body: CharacterFeaturesResponse = {
      perspective: perspective.label,
      features: sheet.classes.flatMap((entry) => {
        const english = srdClass(entry.classId);
        return english ? featuresOf(sheet, entry, english, language) : [];
      }),
    };
    return reply.send(body);
  });
}
