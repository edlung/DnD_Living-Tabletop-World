import { AMMUNITION_KINDS, campaignIdSchema, entityIdSchema } from '@ltw/contracts';
import type { CharacterSheet, InventoryResponse, WeaponId } from '@ltw/contracts';
import {
  ammunitionOf,
  campaignOptions,
  carriedWeightLb,
  characterSheetView,
  inventoryView,
  wieldedWeapons,
  type WorldState,
} from '@ltw/domain';
import { carryingCapacityLb, deriveCharacter, loadSpeedFt, weaponAttack } from '@ltw/rules';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { sendError } from '../errors.ts';
import { withPerspective, type RouteDependencies } from '../request-context.ts';
import { withSrdWords } from '../../items/srd-words.ts';

const params = z.object({ campaignId: campaignIdSchema, entityId: entityIdSchema }).strict();
const query = z.object({ perspective: z.string() }).strict();

/** The most a character's load lets it move, where the campaign enforces carrying (ADR 0056 §3). */
const loadOf = (state: WorldState, entityId: string, sheet: CharacterSheet): number | null =>
  campaignOptions(state).carrying === 'enforced'
    ? loadSpeedFt(sheet, carriedWeightLb(state, entityId))
    : null;

export function registerCharacterRoutes(app: FastifyInstance, deps: RouteDependencies): void {
  app.get('/campaigns/:campaignId/entities/:entityId/sheet', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, { params, query });
    if (!ready) return reply;
    const { context, params: path } = ready;
    const body = characterSheetView(context.state, context.perspective, path.entityId);
    if (!body) return sendError(reply, request, 'NOT_FOUND');
    // The rules' numbers beside the sheet (Stage 500): the client shows them, never recomputes them.
    // Weapons the character wields count beside the sheet's own (Stage 520).
    const wielded = wieldedWeapons(context.state, path.entityId);
    // Counted ammunition, by kind: only the kinds it carries stacks of (docs/adr/0047-weapons.md §5).
    const ammunition = Object.fromEntries(
      AMMUNITION_KINDS.flatMap((kind) => {
        const stacks = ammunitionOf(context.state, path.entityId, kind);
        return stacks.length === 0
          ? []
          : [[kind, stacks.reduce((sum, stack) => sum + stack.quantity, 0)]];
      }),
    );
    // An SRD spell's words in the campaign's language (docs/adr/0055-rules-reference-and-toolbox.md §5).
    const language = context.state.campaign?.language === 'ru' ? 'ru' : 'en';
    const load = loadOf(context.state, path.entityId, body.sheet);
    // A portrait asked for: the DM's and its own player's to know (docs/adr/0056-…md §5).
    const wish = context.state.portraitWishes.get(path.entityId);
    const own =
      context.perspective.kind === 'DM' ||
      (context.perspective.kind === 'CHARACTER' && context.perspective.holderId === path.entityId);
    return reply.send({
      ...body,
      derived: deriveCharacter(body.sheet, wielded, ammunition, language, load),
      ...(wish !== undefined && own ? { portraitWish: wish } : {}),
    });
  });

  app.get('/campaigns/:campaignId/entities/:entityId/inventory', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, { params, query });
    if (!ready) return reply;
    const { context, params: path } = ready;
    const viewed = inventoryView(context.state, context.perspective, path.entityId);
    if (!viewed) return sendError(reply, request, 'NOT_FOUND');
    // An SRD entry's words beside it (docs/adr/0054-items-as-data.md §4).
    const body = withSrdWords(viewed, context.state.campaign?.language === 'ru' ? 'ru' : 'en');
    // With a sheet, what Strength carries and each carried weapon's attack (Stage 520).
    const sheet = context.state.characterSheets.get(path.entityId);
    if (!sheet) return reply.send(body);
    const carried = [
      ...new Set(body.items.flatMap((item) => (item.catalog?.weapon ? [item.catalog.weapon] : []))),
    ];
    const load = loadOf(context.state, path.entityId, sheet);
    const enriched: InventoryResponse = {
      ...body,
      capacityLb: carryingCapacityLb(sheet),
      ...(load === null ? {} : { loadSpeedFt: load }),
      weapons: Object.fromEntries(
        carried.map((weaponId: WeaponId) => {
          const attack = weaponAttack(sheet, weaponId);
          return [
            weaponId,
            {
              attackBonus: attack.attackBonus,
              damage: attack.damage,
              damageType: attack.damageType,
              ranged: attack.ranged,
              normalRangeFt: attack.normalRangeFt,
              longRangeFt: attack.longRangeFt,
              properties: attack.properties,
            },
          ];
        }),
      ),
    };
    return reply.send(enriched);
  });
}
