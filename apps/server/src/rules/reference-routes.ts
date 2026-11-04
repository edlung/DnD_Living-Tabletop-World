import {
  campaignIdSchema,
  srdIdSchema,
  type RulesEntryResponse,
  type RulesIndexResponse,
  type RulesSectionResponse,
  type SrdRulesSection,
} from '@ltw/contracts';
import { campaignRole, type Actor } from '@ltw/domain';
import {
  SRD_GLOSSARY,
  SRD_RULES_SECTIONS,
  abbreviationsIn,
  glossaryEntryIn,
  rulesSectionIn,
  srdGlossaryEntry,
  srdRulesSection,
  type ReferenceLanguage,
} from '@ltw/rules';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { sendError } from '../http/errors.ts';
import { authenticate, parseInput, type RouteDependencies } from '../http/request-context.ts';

/**
 * The SRD's rules as a reference (docs/adr/0055-rules-reference-and-toolbox.md §2–3): the Rules
 * Glossary for everyone at the table, the Gameplay Toolbox and the magic items' rules for the DM.
 * Read only; English until the Russian pass gives a Russian campaign its words (§5).
 */
const params = z.object({ campaignId: campaignIdSchema }).strict();
const entryParams = z.object({ campaignId: campaignIdSchema, entryId: srdIdSchema }).strict();
const sectionParams = z.object({ campaignId: campaignIdSchema, sectionId: srdIdSchema }).strict();

/** The index in a language: Russian names where their Russian is current. */
function indexIn(language: ReferenceLanguage) {
  const entries = SRD_GLOSSARY.map((entry) => glossaryEntryIn(entry, language));
  const sections = SRD_RULES_SECTIONS.map((section) => rulesSectionIn(section, language));
  const abbreviations = abbreviationsIn(language);
  const whole = [...entries, ...sections, abbreviations].every((one) => one.language === language);
  return {
    entries: entries.map(({ value: { entryId, name, tag } }) => ({ entryId, name, tag })),
    sections: sections.map(({ value: { sectionId, part, title, level, subtitle } }) => ({
      sectionId,
      part,
      title,
      level,
      subtitle,
    })),
    abbreviations: abbreviations.value,
    language: whole ? language : ('en' as const),
  };
}
/** Made once for each language. */
const INDEX = { en: indexIn('en'), ru: indexIn('ru') };

/**
 * A section and the sections under it, down to the next of its own rank; a chapter is read by its
 * sections, so it comes alone.
 */
function withUnder(section: SrdRulesSection): SrdRulesSection[] {
  if (section.level === 1) return [section];
  const at = SRD_RULES_SECTIONS.indexOf(section);
  const after = SRD_RULES_SECTIONS.slice(at + 1);
  const end = after.findIndex((next) => next.level <= section.level);
  return [section, ...(end < 0 ? after : after.slice(0, end))];
}

/** Who asks, at the table: the DM or a player; anyone else finds no campaign, a TV is refused. */
async function tableRole(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: RouteDependencies,
  actor: Actor,
  campaignId: string,
): Promise<{ readonly role: 'DM' | 'PLAYER'; readonly language: ReferenceLanguage } | null> {
  const state = (await deps.engine.load(campaignId))?.state ?? null;
  const role = campaignRole(state, actor);
  if (role === null || state?.campaign === null || state === null) {
    await sendError(reply, request, 'NOT_FOUND');
    return null;
  }
  if (role !== 'DM' && role !== 'PLAYER') {
    await sendError(reply, request, 'FORBIDDEN');
    return null;
  }
  return { role, language: state.campaign.language === 'ru' ? 'ru' : 'en' };
}

export function registerRulesReferenceRoutes(app: FastifyInstance, deps: RouteDependencies): void {
  // The ADR 0009 order: 401, then 400, then 404 and 403.
  app.get('/campaigns/:campaignId/rules', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(params, request.params, request, reply);
    if (!path) return reply;
    const asking = await tableRole(request, reply, deps, actor, path.campaignId);
    if (!asking) return reply;
    const index = INDEX[asking.language];
    const body: RulesIndexResponse = {
      ...index,
      sections: asking.role === 'DM' ? index.sections : null,
    };
    return reply.send(body);
  });

  app.get('/campaigns/:campaignId/rules/glossary/:entryId', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(entryParams, request.params, request, reply);
    if (!path) return reply;
    const asking = await tableRole(request, reply, deps, actor, path.campaignId);
    if (!asking) return reply;
    const entry = srdGlossaryEntry(path.entryId);
    if (!entry) return sendError(reply, request, 'NOT_FOUND');
    const shown = glossaryEntryIn(entry, asking.language);
    const body: RulesEntryResponse = { entry: shown.value, language: shown.language };
    return reply.send(body);
  });

  app.get('/campaigns/:campaignId/rules/sections/:sectionId', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(sectionParams, request.params, request, reply);
    if (!path) return reply;
    const asking = await tableRole(request, reply, deps, actor, path.campaignId);
    if (!asking) return reply;
    if (asking.role !== 'DM') return sendError(reply, request, 'FORBIDDEN');
    const section = srdRulesSection(path.sectionId);
    if (!section) return sendError(reply, request, 'NOT_FOUND');
    const shown = withUnder(section).map((one) => rulesSectionIn(one, asking.language));
    const body: RulesSectionResponse = {
      sections: shown.map((one) => one.value),
      language: shown.every((one) => one.language === 'ru') ? asking.language : 'en',
    };
    return reply.send(body);
  });
}
