import type { SrdEquipment, SrdEquipmentKind } from '../../packages/contracts/src/index.ts';

import { PRICE, WEIGHT, grouped, priceCp, tableUnder, weightLb } from './tables.ts';
import { pageLinesAt, slugOf, type PdfLine } from './text.ts';

/**
 * The SRD's equipment tables (pages 89–102) as entries (docs/adr/0054-items-as-data.md §1): the
 * coins, the weapons, the armor and the Shield, tack, harness and drawn vehicles, and food and
 * drink. The tools and the adventuring gear, which the SRD writes as entries, are `gear.ts`'s. A
 * row this cannot read throws.
 */
export type EquipmentKind = SrdEquipmentKind;
export type SrdEquipmentText = SrdEquipment;
export type SrdWeaponRow = NonNullable<SrdEquipment['weapon']>;
export type SrdArmorRow = NonNullable<SrdEquipment['armor']>;
export type SrdToolText = NonNullable<SrdEquipment['tool']>;

const entry = (
  name: string,
  kind: EquipmentKind,
  costCp: number | null,
  weight: number | null,
  text = '',
): SrdEquipmentText => ({ itemId: slugOf(name), name, kind, costCp, weightLb: weight, text });

/** The five coins of the Coin Values table (page 89); fifty coins weigh a pound. */
export function parseCoins(lines: readonly PdfLine[]): SrdEquipmentText[] {
  return tableUnder(lines, /^Coin Value in GP$/).map((row) => {
    const match = /^(\w+ Piece) \((CP|SP|EP|GP|PP)\) (1\/\d+|\d+)$/.exec(row.text);
    if (!match) throw new Error(`coin row "${row.text}"`);
    const [top, bottom] = (match[3] ?? '').split('/').map(Number);
    const gp = bottom === undefined ? (top ?? 0) : (top ?? 0) / bottom;
    return entry(match[1] ?? '', 'coin', gp * 100, 1 / 50);
  });
}

const MASTERY = 'Cleave|Graze|Nick|Push|Sap|Slow|Topple|Vex';
const WEAPON_ROW = new RegExp(
  `^(.+?) (\\d+d\\d+|\\d+) (Bludgeoning|Piercing|Slashing) (.+?) (${MASTERY}) (${WEIGHT.source}) (${PRICE.source})$`,
);

/** The Weapons table (page 91): its four groups, a row's wrapped properties joined back. */
export function parseWeapons(lines: readonly PdfLine[]): SrdEquipmentText[] {
  const rows = tableUnder(lines, /^Name Damage Properties Mastery Weight Cost$/);
  const weapons: SrdEquipmentText[] = [];
  let group: Pick<SrdWeaponRow, 'category' | 'melee'> | null = null;
  const first = Math.min(...rows.filter((row) => !row.italic).map((row) => row.x0));
  for (const row of rows) {
    if (row.italic) {
      const named = /^(Simple|Martial) (Melee|Ranged) Weapons$/.exec(row.text);
      if (!named) throw new Error(`weapon group "${row.text}"`);
      group = {
        category: named[1] === 'Simple' ? 'simple' : 'martial',
        melee: named[2] === 'Melee',
      };
      continue;
    }
    // A row whose properties wrapped: the rest of them under the Properties column.
    if (row.x0 > first + 40) {
      const last = weapons.pop();
      if (!last?.weapon) throw new Error(`weapon continuation "${row.text}"`);
      weapons.push({
        ...last,
        weapon: {
          ...last.weapon,
          properties: propertiesOf(`${last.weapon.properties.join(', ')}, ${row.text}`),
        },
      });
      continue;
    }
    const match = WEAPON_ROW.exec(row.text);
    if (!match || !group) throw new Error(`weapon row "${row.text}"`);
    const [
      ,
      name = '',
      damage = '',
      damageType = '',
      properties = '',
      mastery = '',
      weight = '',
      cost = '',
    ] = match;
    weapons.push({
      ...entry(name, 'weapon', priceCp(cost), weightLb(weight)),
      weapon: {
        ...group,
        damage,
        damageType: damageType.toLowerCase() as SrdWeaponRow['damageType'],
        properties: propertiesOf(properties),
        mastery: mastery.toLowerCase(),
      },
    });
  }
  return weapons;
}

/** "Finesse, Light, Thrown (Range 20/60)" → its properties; "—" → none. */
function propertiesOf(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of text.replace(/,\s*,/g, ',')) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else current += char;
  }
  parts.push(current.trim());
  return parts.filter((part) => part !== '' && part !== '—');
}

const ARMOR_ROW = new RegExp(
  `^(.+?) (\\d+|\\+\\d)(?: \\+ Dex modifier(?: \\(max (\\d)\\))?)?\\s*(—|Str \\d+)\\s*(—|Disadvantage) (${WEIGHT.source}) (${PRICE.source})$`,
);

/** The Armor table (page 92): light, medium and heavy armor, and the Shield. */
export function parseArmor(lines: readonly PdfLine[]): SrdEquipmentText[] {
  const rows = tableUnder(lines, /^Armor Armor Class \(AC\) Strength Stealth Weight Cost$/);
  const armor: SrdEquipmentText[] = [];
  let group: { category: SrdArmorRow['category']; heading: string } | null = null;
  for (const row of rows) {
    const named = /^(Light|Medium|Heavy) Armor \((.+)\)$|^Shield \((.+)\)$/.exec(row.text);
    if (named) {
      group = {
        category:
          named[1] === undefined ? 'shield' : (named[1].toLowerCase() as SrdArmorRow['category']),
        heading: row.text,
      };
      continue;
    }
    const match = ARMOR_ROW.exec(row.text);
    if (!match || !group) throw new Error(`armor row "${row.text}"`);
    const [, name = '', armorClass = '', cap, strength = '', stealth = '', weight = '', cost = ''] =
      match;
    const category = group.category;
    armor.push({
      ...entry(
        name,
        category === 'shield' ? 'shield' : 'armor',
        priceCp(cost),
        weightLb(weight),
        `${group.heading}.`,
      ),
      armor: {
        category,
        armorClass: Number(armorClass.replace('+', '')),
        dexCap: category === 'light' ? null : category === 'medium' ? Number(cap ?? 2) : 0,
        strength: strength === '—' ? null : Number(strength.replace('Str ', '')),
        stealthDisadvantage: stealth === 'Disadvantage',
      },
    });
  }
  return armor;
}

const PRICED_ROW = new RegExp(`^(.+?) (${WEIGHT.source}) (${PRICE.source})$`);

/**
 * The Tack, Harness, and Drawn Vehicles table (page 100): a saddle's kinds are entries of their
 * own; feed is food; stabling is a service and stays out.
 */
export function parseTack(lines: readonly PdfLine[]): SrdEquipmentText[] {
  return grouped(tableUnder(lines, /^Item Weight Cost$/)).flatMap(({ row, group }) => {
    if (/^Stabling/.test(row.text)) return [];
    const match = PRICED_ROW.exec(row.text);
    if (!match) throw new Error(`tack row "${row.text}"`);
    const named = (match[1] ?? '').replace(/^Feed per day$/, 'Feed (per day)');
    const name = group ? `${named} ${group}` : named;
    return [
      entry(
        name,
        /^Feed/.test(name) ? 'food' : 'tack',
        priceCp(match[3] ?? ''),
        weightLb(match[2] ?? ''),
      ),
    ];
  });
}

const FOOD_ROW = new RegExp(`^(.+?) (${PRICE.source})$`);

/**
 * Food and drink from the Food, Drink, and Lodging tables (pages 101–102): ale, bread, cheese and
 * wine. An inn's stay and a meal are lodging, which a lifestyle pays; they stay out.
 */
export function parseFood(tables: readonly (readonly PdfLine[])[]): SrdEquipmentText[] {
  const rows = tables.flatMap((lines) => tableUnder(lines, /^Item Cost$/));
  return grouped(rows).flatMap(({ row, group }) => {
    if (group !== null && group !== 'Wine (bottle)') return [];
    const match = FOOD_ROW.exec(row.text);
    if (!match) throw new Error(`food row "${row.text}"`);
    const name = group === null ? (match[1] ?? '') : `${match[1] ?? ''} Wine (bottle)`;
    return [entry(name, 'food', priceCp(match[2] ?? ''), null)];
  });
}

/** The equipment tables of the Equipment chapter. */
export function parseEquipmentTables(dir: string): SrdEquipmentText[] {
  const page = (number: number) => pageLinesAt(dir, number);
  const right = (lines: readonly PdfLine[]) => lines.filter((line) => line.x0 > 306);
  // The two halves of each food table, side by side: left half first, then right.
  const halves = (lines: readonly PdfLine[], split: number) => [
    lines.filter((line) => line.x0 < split),
    lines.filter((line) => line.x0 >= split),
  ];
  const tack = right(page(100));
  const tackHeader = tack.find((line) => /^Item Weight Cost$/.test(line.text));
  if (!tackHeader) throw new Error('no tack table');
  return [
    ...parseCoins(page(89)),
    ...parseWeapons(page(91)),
    ...parseArmor(page(92)),
    ...parseTack(tack.filter((line) => line.y0 <= tackHeader.y0 + 2)),
    ...parseFood([
      ...halves(right(page(101)), 428),
      ...halves(
        page(102).filter((line) => line.y0 > 600 && line.x0 < 306),
        178,
      ),
    ]),
  ];
}
