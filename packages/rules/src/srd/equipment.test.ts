import { WEAPON_IDS, srdEquipmentSchema, type SrdEquipment } from '@ltw/contracts';
import { SRD_ITEM_CATALOG, srdItemEntry } from '@ltw/contracts/srd-items';
import { describe, expect, it } from 'vitest';

import { WEAPONS } from '../weapons.ts';
import { SRD_EQUIPMENT, srdEquipment } from './catalog.ts';

/**
 * The SRD's equipment as imported (docs/adr/0054-items-as-data.md §1–2): each entry holds to its
 * schema, the weapon table agrees with the rules' weapons number for number, and every catalog
 * entry the World Engine applies has the SRD's words beside it.
 */
const ofKind = (kind: SrdEquipment['kind']) => SRD_EQUIPMENT.filter((entry) => entry.kind === kind);

describe('the equipment', () => {
  it('is the Equipment chapter’s, each to its schema, ids unique', () => {
    for (const entry of SRD_EQUIPMENT)
      expect(srdEquipmentSchema.safeParse(entry).success, entry.itemId).toBe(true);
    const ids = SRD_EQUIPMENT.map((entry) => entry.itemId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ofKind('coin')).toHaveLength(5);
    expect(ofKind('weapon')).toHaveLength(38);
    expect(ofKind('armor')).toHaveLength(12);
    expect(ofKind('shield')).toHaveLength(1);
    expect(ofKind('ammunition').map((entry) => entry.itemId)).toEqual([
      'arrow',
      'bolt',
      'firearm-bullet',
      'sling-bullet',
      'needle',
    ]);
    // The seven packs, the tools with their kinds, and the gear.
    expect(ofKind('pack')).toHaveLength(7);
    expect(ofKind('tool').length).toBeGreaterThanOrEqual(37);
    expect(ofKind('gear').length).toBeGreaterThanOrEqual(70);
  });

  it('prices and weighs as the SRD does', () => {
    expect(srdEquipment('plate-armor')).toMatchObject({ costCp: 150_000, weightLb: 65 });
    expect(srdEquipment('dart')).toMatchObject({ costCp: 5, weightLb: 0.25 });
    expect(srdEquipment('entertainers-pack')).toMatchObject({ costCp: 4000, weightLb: 58.5 });
    expect(srdEquipment('sling-bullet')).toMatchObject({
      costCp: 4,
      weightLb: 1.5,
      bundle: { amount: 20, storage: 'Pouch' },
    });
    expect(srdEquipment('lute-musical-instrument')).toMatchObject({ costCp: 3500, weightLb: 2 });
    expect(srdEquipment('gold-piece')).toMatchObject({ costCp: 100, weightLb: 0.02 });
    expect(srdEquipment('rope')?.text).toMatch(/^As a Utilize action, you can tie a knot/);
  });
});

describe('the weapon table', () => {
  it('agrees with the rules’ weapons: damage, properties, mastery, range', () => {
    expect(
      ofKind('weapon')
        .map((entry) => entry.itemId)
        .sort(),
    ).toEqual([...WEAPON_IDS].sort());
    for (const id of WEAPON_IDS) {
      const row = srdEquipment(id)?.weapon;
      const rules = WEAPONS[id];
      if (!row) throw new Error(`no SRD row for ${id}`);
      const dice =
        rules.flatDamage === undefined
          ? `${String(rules.damageDice.count)}d${String(rules.damageDice.sides)}`
          : String(rules.flatDamage);
      expect(row.damage, id).toBe(dice);
      expect(row.damageType, id).toBe(rules.damageType);
      expect(row.mastery, id).toBe(rules.mastery);
      expect(row.category, id).toBe(rules.category);
      // A Dart is a ranged weapon one throws; a Javelin, a melee weapon one may throw.
      expect(row.melee, id).toBe(!rules.ranged);
      const named = row.properties.map((property) =>
        property
          .replace(/ \(.*\)$/, '')
          .toLowerCase()
          .replace(' ', '-'),
      );
      expect(named.sort(), id).toEqual([...rules.properties].sort());
      const range = row.properties.join(' ').match(/Range (\d+)\/(\d+)/);
      if (range) {
        const [normal, long] = [Number(range[1]), Number(range[2])];
        const ruled = rules.thrownRange ?? {
          normalFt: rules.normalRangeFt,
          longFt: rules.longRangeFt,
        };
        expect([ruled.normalFt, ruled.longFt], id).toEqual([normal, long]);
      }
      const versatile = /Versatile \(1d(\d+)\)/.exec(row.properties.join(' '));
      expect(rules.versatileSides, id).toBe(versatile ? Number(versatile[1]) : undefined);
    }
  });
});

describe('the catalog’s SRD entries', () => {
  it('each have the SRD’s words beside them, and stand for what the text says', () => {
    // The equipment's, one each; the magic items' follow their text (`magic.test.ts`).
    const equipment = SRD_ITEM_CATALOG.filter((entry) => srdEquipment(entry.itemId.slice(4)));
    expect(equipment).toHaveLength(SRD_EQUIPMENT.length);
    for (const entry of equipment)
      expect(entry.name.en).toBe(srdEquipment(entry.itemId.slice(4))?.name);
    expect(srdItemEntry('srd-chain-mail')).toMatchObject({
      category: 'armor',
      slots: ['body'],
      armor: { baseAc: 16, dexCap: 0, strength: 13, stealthDisadvantage: true },
      valueCp: 7500,
    });
    expect(srdItemEntry('srd-shield')).toMatchObject({ category: 'shield', shieldBonus: 2 });
    expect(srdItemEntry('srd-dagger')).toMatchObject({
      weapon: 'dagger',
      slots: ['mainhand', 'offhand'],
    });
    // One piece of ammunition: a twentieth of the bundle's price and weight.
    expect(srdItemEntry('srd-sling-bullet')).toMatchObject({
      ammunition: 'bullet',
      stackable: true,
      valueCp: 0.2,
      weightLb: 0.075,
    });
    expect(srdItemEntry('srd-firearm-bullet')).toMatchObject({ ammunition: 'firearm-bullet' });
    expect(srdItemEntry('srd-potion-of-healing')).toMatchObject({
      category: 'consumable',
      stackable: true,
    });
  });
});
