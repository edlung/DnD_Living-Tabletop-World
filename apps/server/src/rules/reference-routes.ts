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
  SRD_ABBREVIATIONS,
  SRD_GLOSSARY,
  SRD_RULES_SECTIONS,
  srdGlossaryEntry,
  srdRulesSection,
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

const ENTRIES = SRD_GLOSSARY.map(({ entryId, name, tag }) => ({ entryId, name, tag }));
const SECTIONS = SRD_RULES_SECTIONS.map(({ sectionId, part, title, level, subtitle }) => ({
  sectionId,
  part,
  title,
  level,
  subtitle,
}));

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
): Promise<'DM' | 'PLAYER' | null> {
  const state = (await deps.engine.load(campaignId))?.state ?? null;
  const role = campaignRole(state, actor);
  if (role === null) {
    await sendError(reply, request, 'NOT_FOUND');
    return null;
  }
  if (role !== 'DM' && role !== 'PLAYER') {
    await sendError(reply, request, 'FORBIDDEN');
    return null;
  }
  return role;
}

export function registerRulesReferenceRoutes(app: FastifyInstance, deps: RouteDependencies): void {
  // The ADR 0009 order: 401, then 400, then 404 and 403.
  app.get('/campaigns/:campaignId/rules', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(params, request.params, request, reply);
    if (!path) return reply;
    const role = await tableRole(request, reply, deps, actor, path.campaignId);
    if (!role) return reply;
    const body: RulesIndexResponse = {
      abbreviations: SRD_ABBREVIATIONS,
      entries: ENTRIES,
      sections: role === 'DM' ? SECTIONS : null,
      language: 'en',
    };
    return reply.send(body);
  });

  app.get('/campaigns/:campaignId/rules/glossary/:entryId', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(entryParams, request.params, request, reply);
    if (!path) return reply;
    if (!(await tableRole(request, reply, deps, actor, path.campaignId))) return reply;
    const entry = srdGlossaryEntry(path.entryId);
    if (!entry) return sendError(reply, request, 'NOT_FOUND');
    const body: RulesEntryResponse = { entry, language: 'en' };
    return reply.send(body);
  });

  app.get('/campaigns/:campaignId/rules/sections/:sectionId', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(sectionParams, request.params, request, reply);
    if (!path) return reply;
    const role = await tableRole(request, reply, deps, actor, path.campaignId);
    if (!role) return reply;
    if (role !== 'DM') return sendError(reply, request, 'FORBIDDEN');
    const section = srdRulesSection(path.sectionId);
    if (!section) return sendError(reply, request, 'NOT_FOUND');
    const body: RulesSectionResponse = { sections: withUnder(section), language: 'en' };
    return reply.send(body);
  });
}
