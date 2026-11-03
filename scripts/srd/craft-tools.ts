import type { SrdEquipmentText } from './equipment.ts';

/**
 * Which tools make which equipment (SRD 5.2.1 "Tools": each tool's "Craft:" line;
 * docs/adr/0057-encounters-maps-loot.md §9), by the equipment's slug, each tool by its catalog id.
 * A line names a piece as the table does, or the other way round ("Glass Bottle" is "Bottle,
 * Glass"), ammunition in the plural, or a kind: "Any Melee weapon (except …)", "Ranged weapons
 * (except …)", "Medium armor (except Hide)", "Heavy armor", "Arcane Focus", "Druidic Focus", "Holy
 * Symbol". A Spell Scroll is scribed, not crafted (`SPELL_SCROLL_COSTS` in `@ltw/contracts`). A
 * name no piece answers stops the import.
 */
export function craftTools(
  equipment: readonly SrdEquipmentText[],
  prefix: string,
): Map<string, string[]> {
  const made = new Map<string, string[]>();
  const add = (slug: string, toolId: string) => {
    const tools = made.get(slug) ?? [];
    if (!tools.includes(toolId)) made.set(slug, [...tools, toolId]);
  };
  for (const tool of equipment) {
    if (!tool.tool?.craft) continue;
    for (const part of craftParts(tool.tool.craft)) {
      if (part === 'Spell Scroll') continue;
      const pieces = piecesFor(equipment, part);
      if (pieces.length === 0)
        throw new Error(`${tool.itemId} crafts "${part}": no such equipment`);
      for (const piece of pieces) add(piece.itemId, `${prefix}${tool.itemId}`);
    }
  }
  return made;
}

/** The line's parts, split at the commas outside parentheses. */
function craftParts(line: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of line) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else current += char;
  }
  parts.push(current.trim());
  return parts.filter((part) => part !== '');
}

const plain = (name: string) => name.toLowerCase().replaceAll('’', "'");

/** "Club, Greatclub, Quarterstaff, and Whip" as names. */
const exceptions = (list: string | undefined) =>
  (list ?? '')
    .split(/,\s*(?:and\s+)?|\s+and\s+/)
    .map((name) => plain(name.trim()))
    .filter((name) => name !== '');

const FOCUS: Readonly<Record<string, string>> = {
  'arcane focus': '-arcane-focus',
  'druidic focus': '-druidic-focus',
  'holy symbol': '-holy-symbol',
};

function piecesFor(equipment: readonly SrdEquipmentText[], part: string): SrdEquipmentText[] {
  const weapons = /^(Any Melee weapon|Ranged weapons)(?: \(except (.+)\))?$/.exec(part);
  if (weapons) {
    const melee = weapons[1] === 'Any Melee weapon';
    const except = exceptions(weapons[2]);
    return equipment.filter(
      (piece) =>
        piece.weapon !== undefined &&
        piece.weapon.melee === melee &&
        !except.includes(plain(piece.name)),
    );
  }
  const armor = /^(Medium|Heavy) armor(?: \(except (.+)\))?$/.exec(part);
  if (armor) {
    const category = armor[1] === 'Medium' ? 'medium' : 'heavy';
    const except = exceptions(armor[2]);
    return equipment.filter(
      (piece) =>
        piece.kind === 'armor' &&
        piece.armor?.category === category &&
        !except.some((name) => plain(piece.name).startsWith(name)),
    );
  }
  const name = plain(part);
  const focus = FOCUS[name];
  if (focus !== undefined) return equipment.filter((piece) => piece.itemId.endsWith(focus));
  const named = equipment.filter((piece) => plain(piece.name) === name);
  if (named.length > 0) return named;
  // "Glass Bottle" is "Bottle, Glass"; "Map or Scroll Case" is "Case, Map or Scroll".
  const words = name.split(' ');
  const inverted = `${words.at(-1) ?? ''}, ${words.slice(0, -1).join(' ')}`;
  const turned = equipment.filter((piece) => plain(piece.name) === inverted);
  if (turned.length > 0) return turned;
  // "Arrows" and "Firearm Bullets" are the ammunition sold as "Arrow" and "Firearm Bullet".
  return equipment.filter(
    (piece) => piece.kind === 'ammunition' && `${plain(piece.name)}s` === name,
  );
}
