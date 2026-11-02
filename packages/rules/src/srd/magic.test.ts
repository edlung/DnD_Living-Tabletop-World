import { srdMagicItemSchema } from '@ltw/contracts';
import { SRD_ITEM_CATALOG, srdItemEntry } from '@ltw/contracts/srd-items';
import { describe, expect, it } from 'vitest';

import { SRD_MAGIC_ITEMS, srdEquipment, srdMagicItem } from './catalog.ts';

/**
 * The SRD's magic items as imported (docs/adr/0054-items-as-data.md §1, §5): each holds to its
 * schema; each magic catalog entry follows an item's text; what the text says regularly — a bonus,
 * charges and their dawn, a curse, the bases an item may be made on — is in the entry.
 */
const magic = SRD_ITEM_CATALOG.filter((entry) => entry.magic !== undefined);

describe('the magic items', () => {
  it('are Magic Items A–Z, each to its schema, ids unique', () => {
    expect(SRD_MAGIC_ITEMS).toHaveLength(258);
    for (const item of SRD_MAGIC_ITEMS)
      expect(srdMagicItemSchema.safeParse(item).success, item.itemId).toBe(true);
    expect(new Set(SRD_MAGIC_ITEMS.map((item) => item.itemId)).size).toBe(258);
    expect(srdMagicItem('ring-of-protection')).toMatchObject({
      category: 'Ring',
      rarity: 'Rare',
      attunement: '',
    });
    expect(srdMagicItem('staff-of-healing')?.attunement).toBe('by a Bard, Cleric, or Druid');
    expect(srdMagicItem('armor-of-vulnerability')?.text).toMatch(/\nCurse\. This armor is cursed/);
  });

  it('each catalog entry follows an item’s text, made on what the text allows', () => {
    for (const entry of magic) {
      expect(srdMagicItem(entry.magic?.text ?? ''), entry.itemId).toBeDefined();
      for (const base of entry.magic?.base?.allowed ?? [])
        expect(srdEquipment(base.slice(4)), `${entry.itemId} on ${base}`).toBeDefined();
    }
    expect(srdItemEntry('srd-berserker-axe')?.magic?.base?.allowed).toEqual([
      'srd-battleaxe',
      'srd-greataxe',
      'srd-halberd',
    ]);
    expect(srdItemEntry('srd-adamantine-armor')?.magic?.base?.allowed).not.toContain(
      'srd-hide-armor',
    );
  });

  it('holds the bonuses, charges and curses its words give regularly', () => {
    for (const plus of [1, 2, 3]) {
      expect(srdItemEntry(`srd-weapon-plus-${String(plus)}`)?.magic?.bonus).toEqual({
        attack: plus,
        damage: plus,
      });
      expect(srdItemEntry(`srd-armor-plus-${String(plus)}`)?.magic?.bonus).toEqual({
        armorClass: plus,
      });
      expect(srdItemEntry(`srd-shield-plus-${String(plus)}`)?.magic?.bonus).toEqual({
        armorClass: plus,
      });
    }
    expect(srdItemEntry('srd-weapon-plus-3')?.magic?.rarity).toBe('very-rare');
    expect(srdItemEntry('srd-armor-plus-3')?.magic?.rarity).toBe('legendary');
    expect(srdItemEntry('srd-ring-of-protection')).toMatchObject({
      slots: ['ring'],
      magic: { attunement: '', bonus: { armorClass: 1, saves: 1 } },
    });
    expect(srdItemEntry('srd-cloak-of-protection')?.slots).toEqual(['cloak']);
    expect(srdItemEntry('srd-wand-of-magic-missiles')?.magic?.charges).toEqual({
      max: 7,
      regain: { count: 1, sides: 6, bonus: 1 },
    });
    const cursed = magic.filter((entry) => entry.magic?.cursed).map((entry) => entry.itemId);
    expect(cursed).toEqual([
      'srd-armor-of-vulnerability',
      'srd-berserker-axe',
      'srd-demon-armor',
      'srd-shield-of-missile-attraction',
    ]);
  });

  it('prices by rarity, and heals by the potion’s dice', () => {
    // An uncommon item is worth 400 GP; a rare consumable, half of 4,000 GP.
    expect(srdItemEntry('srd-bag-of-holding')?.valueCp).toBe(40_000);
    expect(srdItemEntry('srd-potion-of-healing-superior')).toMatchObject({
      valueCp: 200_000,
      effect: { kind: 'heal-dice', count: 8, sides: 4, bonus: 8 },
    });
    expect(srdItemEntry('srd-potion-of-healing')?.effect).toEqual({
      kind: 'heal-dice',
      count: 2,
      sides: 4,
      bonus: 2,
    });
    expect(srdItemEntry('srd-potion-of-healing-supreme')?.effect).toMatchObject({ bonus: 20 });
  });
});
