import { createHash } from 'node:crypto';

import {
  ITEM_CATALOG,
  campaignIdSchema,
  catalogItemIdSchema,
  giveCatalogItemRequestSchema,
  type GivenCatalogItemResponse,
  type CommandRejected,
  type ItemCatalogEntryResponse,
  type ItemCatalogListing,
  type ItemCatalogResponse,
  type ItemEntry,
} from '@ltw/contracts';
import { SRD_ITEM_CATALOG } from '@ltw/contracts/srd-items';
import { baseOfGrant, grantRefusal, itemEntry } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { statusOf } from '../http/command-status.ts';
import { dmCampaignState } from '../http/dm-campaign.ts';
import { sendError } from '../http/errors.ts';
import { authenticate, parseInput, type RouteDependencies } from '../http/request-context.ts';
import { srdMagicOf, srdWordsOf } from './srd-words.ts';

/**
 * The DM's item catalog (docs/adr/0054-items-as-data.md §4): Ravenford's own entries and the
 * SRD's, found on the DM screen; one given to a character or a creature is a new item it carries,
 * made and granted through the World Engine as the DM's own commands. A retry of the same request
 * gives nothing more.
 */
const params = z.object({ campaignId: campaignIdSchema }).strict();
const entryParams = z
  .object({ campaignId: campaignIdSchema, itemId: catalogItemIdSchema })
  .strict();

const listing = (entry: ItemEntry): ItemCatalogListing => ({
  itemId: entry.itemId,
  name: { ru: entry.name.ru, en: entry.name.en },
  category: entry.category,
  valueCp: entry.valueCp,
  weightLb: entry.weightLb,
  stackable: entry.stackable,
  source: entry.source ?? null,
  untranslated: entry.untranslated === true,
  rarity: entry.magic?.rarity ?? null,
  attunement: entry.magic?.attunement ?? null,
  base: entry.magic?.base ?? null,
});

const LIST: ItemCatalogResponse = { items: [...ITEM_CATALOG, ...SRD_ITEM_CATALOG].map(listing) };

/**
 * A given item's name in the campaign's language: a magic weapon, armor or shield made on its base
 * takes the base's name — "Weapon, +1" on a Longsword is "Longsword, +1", a Flame Tongue on it
 * "Flame Tongue (Longsword)".
 */
function madeName(
  entry: ItemEntry,
  base: ItemEntry | null | string,
  language: 'en' | 'ru',
): string {
  const own = entry.name[language];
  if (base === null || typeof base === 'string') return own;
  const plus = /^(Weapon|Armor|Shield|Ammunition)(, \+\d)$/.exec(entry.name.en);
  return plus ? `${base.name[language]}${plus[2] ?? ''}` : `${own} (${base.name[language]})`;
}

export function registerItemCatalogRoutes(app: FastifyInstance, deps: RouteDependencies): void {
  // The ADR 0009 order: 401, then 400, then 404 and 403.
  app.get('/campaigns/:campaignId/items/catalog', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(params, request.params, request, reply);
    if (!path) return reply;
    if (!(await dmCampaignState(request, reply, deps, actor, path.campaignId))) return reply;
    return reply.send(LIST);
  });

  app.get('/campaigns/:campaignId/items/catalog/:itemId', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(entryParams, request.params, request, reply);
    if (!path) return reply;
    if (!(await dmCampaignState(request, reply, deps, actor, path.campaignId))) return reply;
    const entry = itemEntry(path.itemId);
    if (!entry) return sendError(reply, request, 'NOT_FOUND');
    const body: ItemCatalogEntryResponse = {
      item: {
        ...listing(entry),
        description: { ru: entry.description.ru, en: entry.description.en },
      },
      srd: srdWordsOf(entry.itemId),
      magic: srdMagicOf(entry.itemId),
    };
    return reply.send(body);
  });

  app.post('/campaigns/:campaignId/items/catalog/:itemId/give', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(entryParams, request.params, request, reply);
    if (!path) return reply;
    const body = parseInput(giveCatalogItemRequestSchema, request.body, request, reply);
    if (!body) return reply;
    const state = await dmCampaignState(request, reply, deps, actor, path.campaignId);
    if (!state) return reply;
    const entry = itemEntry(path.itemId);
    if (!entry) return sendError(reply, request, 'NOT_FOUND');
    // An opaque id from the request: a retry names the same item (ADR 0037's opaque ids).
    const itemId = `item-${createHash('sha256').update(`${path.campaignId}:${body.requestId}`).digest('hex').slice(0, 8)}`;
    const prefix = `items.give.${body.requestId}`;
    // A grant the World Engine would refuse is refused before the item is made: none is left
    // behind (the engine checks again).
    const baseId = body.baseCatalogId ?? null;
    const refused = state.commands.has(`${prefix}.grant`)
      ? null
      : grantRefusal(state, body.holderId, entry.itemId, body.quantity, baseId);
    if (refused) {
      const rejected: CommandRejected = {
        status: 'rejected',
        commandId: `${prefix}.grant`,
        ...refused.rejection,
      };
      return reply.code(statusOf(rejected)).send(rejected);
    }
    const name = madeName(entry, baseOfGrant(entry, baseId), state.campaign?.language ?? 'en');
    const commands = [
      {
        commandId: `${prefix}.create`,
        command: {
          type: 'CreateEntity' as const,
          entityId: itemId,
          kind: 'item' as const,
          name,
          existsSince: null,
        },
      },
      {
        commandId: `${prefix}.grant`,
        command: {
          type: 'GrantItem' as const,
          itemId,
          holderId: body.holderId,
          catalogId: entry.itemId,
          quantity: body.quantity,
          ...(baseId === null ? {} : { baseCatalogId: baseId }),
        },
      },
    ];
    for (const { commandId, command } of commands) {
      if ((await deps.engine.load(path.campaignId))?.state.commands.has(commandId)) continue;
      const result = await deps.engine.execute({
        commandId,
        campaignId: path.campaignId,
        actor,
        command,
      });
      if (result.status === 'rejected') return reply.code(statusOf(result)).send(result);
    }
    request.log.info({ catalogId: entry.itemId }, 'item given from the catalog');
    const given: GivenCatalogItemResponse = { status: 'given', itemId, name };
    return reply.send(given);
  });
}
