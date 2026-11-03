import { AMMUNITION_KINDS, campaignIdSchema, entityIdSchema } from '@ltw/contracts';
import type { InventoryResponse, WeaponId } from '@ltw/contracts';
import { ammunitionOf, characterSheetView, inventoryView, wieldedWeapons } from '@ltw/domain';
import { carryingCapacityLb, deriveCharacter, weaponAttack } from '@ltw/rules';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { sendError } from '../errors.ts';
import { withPerspective, type RouteDependencies } from '../request-context.ts';
import { withSrdWords } from '../../items/srd-words.ts';

const params = z.object({ campaignId: campaignIdSchema, entityId: entityIdSchema }).strict();
const query = z.object({ perspective: z.string() }).strict();

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
    return reply.send({
      ...body,
      derived: deriveCharacter(body.sheet, wielded, ammunition, language),
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
    const enriched: InventoryResponse = {
      ...body,
      capacityLb: carryingCapacityLb(sheet),
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
