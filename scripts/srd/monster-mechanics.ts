import type { SrdEntry, SrdMonsterText } from './monsters.ts';
import { slugOf } from './text.ts';

/**
 * A stat block's mechanics read from its text (docs/adr/0053-monsters-as-data.md §1): the engine's
 * stat block — Armor Class, hit points, size, speeds, senses, scores and saves, initiative,
 * damage and condition defenses, its attacks with their added damage, its Multiattack's count —
 * and the names of the actions it read. The shape is contracts' `statBlockSchema`.
 */
export interface Damage {
  readonly count: number;
  readonly sides: number;
  readonly bonus: number;
  readonly type: string;
}

export interface Attack {
  readonly attackId: string;
  readonly name: string;
  readonly kind: 'melee' | 'ranged';
  readonly bonus: number;
  readonly reachFt?: number;
  readonly normalRangeFt?: number;
  readonly longRangeFt?: number;
  readonly damage: Damage;
  readonly extraDamage?: readonly Damage[];
}

/** An action with a save (docs/adr/0053-monsters-as-data.md §2): a breath, a gaze, a stomp. */
export interface SaveAction {
  readonly actionId: string;
  readonly name: string;
  readonly ability: string;
  readonly dc: number;
  readonly area: {
    readonly shape: string;
    readonly sizeFt: number;
    readonly widthFt: number | null;
    readonly origin: 'self' | 'point';
  } | null;
  /** One creature within this reach, when it has no area. */
  readonly reachFt: number | null;
  /** How far away a point-centred area may be. */
  readonly rangeFt: number | null;
  readonly damage: readonly Damage[];
  readonly onSuccess: 'half' | 'none';
  /** Recharges on a d6 of this or more at the start of its turn ("Recharge 5–6"). */
  readonly recharge: number | null;
  readonly perDay: number | null;
}

export interface MonsterMechanics {
  readonly monsterId: string;
  readonly statBlock: {
    readonly armorClass: number;
    readonly hitPoints: { readonly max: number; readonly current: number };
    readonly resistances?: readonly string[];
    readonly vulnerabilities?: readonly string[];
    readonly immunities?: readonly string[];
    readonly conditionImmunities?: readonly string[];
    readonly speedFt: number;
    readonly size: string;
    readonly speeds?: Readonly<Record<string, number | true>>;
    readonly senses?: Readonly<Record<string, number>>;
    readonly abilities: Readonly<Record<string, number>>;
    readonly savingThrows: Readonly<Record<string, number>>;
    readonly initiativeBonus: number;
    readonly attacksPerAction: number;
    readonly attacks: readonly Attack[];
    readonly saveActions?: readonly SaveAction[];
    readonly spells: readonly never[];
    readonly conditions: readonly never[];
  };
  /** The actions read into attacks; the others stay the DM's to resolve. */
  readonly read: readonly string[];
}

const DAMAGE_TYPES = new Set([
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
]);
const CONDITIONS = new Set([
  'blinded',
  'charmed',
  'deafened',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
]);
/** The engine's dice; a d2, d3 or d20 is left to the DM. */
const SIDES = new Set([4, 6, 8, 10, 12]);
const WORDS: Readonly<Record<string, number>> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
const TYPE =
  '(Acid|Bludgeoning|Cold|Fire|Force|Lightning|Necrotic|Piercing|Poison|Psychic|Radiant|Slashing|Thunder)';

const number = (raw: string): number => Number(raw.replace(/[−–]/, '-').replace('+', ''));

/** "Fire, Poison; Charmed, Exhaustion" → the damage types, then the conditions. */
function defenses(text: string | null): { damage: string[]; conditions: string[] } {
  if (!text) return { damage: [], conditions: [] };
  const [types = '', conditions = ''] = text.split(';');
  const list = (part: string, known: ReadonlySet<string>) =>
    part
      .split(',')
      .map((one) => one.trim().toLowerCase())
      .filter((one) => known.has(one));
  return { damage: list(types, DAMAGE_TYPES), conditions: list(conditions, CONDITIONS) };
}

/** "40 ft., Climb 40 ft., Fly 80 ft. (hover)" → the walk, and the others. */
function speedsOf(text: string): { walk: number; speeds: Record<string, number | true> } {
  const walk = /^(\d+) ft\./.exec(text);
  const speeds: Record<string, number | true> = {};
  for (const match of text.matchAll(/(Fly|Swim|Climb|Burrow) (\d+) ft\.( \(hover\))?/g)) {
    speeds[(match[1] ?? '').toLowerCase()] = Number(match[2]);
    if (match[3]) speeds['hover'] = true;
  }
  return { walk: walk ? Number(walk[1]) : 0, speeds };
}

function sensesOf(text: string): Record<string, number> {
  const senses: Record<string, number> = {};
  for (const match of text.matchAll(/(Blindsight|Darkvision|Tremorsense|Truesight) (\d+) ft\./g))
    senses[(match[1] ?? '').toLowerCase()] = Number(match[2]);
  return senses;
}

/** "13 (2d6 + 6) Slashing" → its dice; a flat "1 Piercing" rolls none. */
function damageOf(average: string, dice: string | undefined, type: string): Damage | null {
  if (dice === undefined)
    return { count: 0, sides: 4, bonus: Number(average), type: type.toLowerCase() };
  const match = /^(\d+)d(\d+)(?: ([+−–-]) (\d+))?$/.exec(dice);
  if (!match || !SIDES.has(Number(match[2]))) return null;
  const bonus = Number(match[4] ?? 0) * (match[3] === '+' || match[3] === undefined ? 1 : -1);
  return { count: Number(match[1]), sides: Number(match[2]), bonus, type: type.toLowerCase() };
}

// Its bonus may say "to hit" or carry a circumstance in parentheses (the DM's); "feet" for "ft.".
const ATTACK = new RegExp(
  `^(Melee or Ranged|Melee|Ranged) Attack Roll: ([+−–-]\\d+)(?: to hit)?(?: \\([^)]*\\))?, (?:reach (\\d+) (?:ft|feet)\\.?)?(?: or )?(?:range (\\d+)(?:/(\\d+))? (?:ft|feet)\\.)? Hit: (\\d+)(?: \\(([^)]+)\\))? ${TYPE} damage(?: plus (\\d+)(?: \\(([^)]+)\\))? ${TYPE} damage)?`,
);

/** An action's attack, or two for one "Melee or Ranged"; none where it reads otherwise. */
export function attacksOf(entry: SrdEntry): Attack[] {
  const match = ATTACK.exec(entry.text);
  if (!match) return [];
  const damage = damageOf(match[6] ?? '0', match[7], match[8] ?? '');
  const extra = match[9] ? damageOf(match[9], match[10], match[11] ?? '') : null;
  if (!damage || (match[9] && !extra)) return [];
  const base = {
    name: entry.name.replace(/ \(.*\)$/, ''),
    bonus: number(match[2] ?? '0'),
    damage,
    ...(extra ? { extraDamage: [extra] } : {}),
  };
  const id = slugOf(base.name);
  const melee: Attack = { ...base, attackId: id, kind: 'melee', reachFt: Number(match[3] ?? 5) };
  const normal = Number(match[4] ?? 0);
  const ranged: Attack = {
    ...base,
    attackId: match[1] === 'Melee or Ranged' ? `${id}-ranged` : id,
    kind: 'ranged',
    normalRangeFt: normal,
    longRangeFt: Number(match[5] ?? normal),
  };
  if (match[1] === 'Melee') return [melee];
  if (match[1] === 'Ranged') return [ranged];
  return [melee, ranged];
}

const ABILITY_IDS: Readonly<Record<string, string>> = {
  Strength: 'str',
  Dexterity: 'dex',
  Constitution: 'con',
  Intelligence: 'int',
  Wisdom: 'wis',
  Charisma: 'cha',
};
const SAVE = new RegExp(
  `^(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw: DC (\\d+), ([^.]+?)\\. Failure: (\\d+) \\(([^)]+)\\) ${TYPE} damage(?: plus (\\d+) \\(([^)]+)\\) ${TYPE} damage)?\\.(?:[^.]*\\.)*? ?Success: (Half damage|No damage)?`,
);

/**
 * An action with a save that deals damage (docs/adr/0053-monsters-as-data.md §2): its area — a
 * cone or a line from the creature, a sphere or emanation — or one creature within its reach; one
 * damage roll, half or none on a success; its Recharge or uses per day from its name.
 */
export function saveActionOf(entry: SrdEntry): SaveAction | null {
  const match = SAVE.exec(entry.text);
  if (!match) return null;
  const who = match[3] ?? '';
  const damage = [
    damageOf(match[4] ?? '0', match[5], match[6] ?? ''),
    ...(match[7] ? [damageOf(match[7], match[8], match[9] ?? '')] : []),
  ];
  if (damage.some((one) => one === null)) return null;
  const cone = /each creature in an? (\d+)-foot Cone/.exec(who);
  const line = /each creature in an? (\d+)-foot-long, (\d+)-foot-wide Line/.exec(who);
  const sphere =
    /each creature in an? (\d+)-foot-radius Sphere centered on (?:a point|[^,]+?) within (\d+) feet/.exec(
      who,
    );
  const emanation = /each creature in an? (\d+)-foot Emanation/.exec(who);
  const single = /^one creature (?:[^,]*?)within (\d+) feet/.exec(who);
  const area = cone
    ? { shape: 'cone', sizeFt: Number(cone[1]), widthFt: null, origin: 'self' as const }
    : line
      ? {
          shape: 'line',
          sizeFt: Number(line[1]),
          widthFt: Number(line[2]),
          origin: 'self' as const,
        }
      : sphere
        ? { shape: 'sphere', sizeFt: Number(sphere[1]), widthFt: null, origin: 'point' as const }
        : emanation
          ? {
              shape: 'emanation',
              sizeFt: Number(emanation[1]),
              widthFt: null,
              origin: 'self' as const,
            }
          : null;
  if (!area && !single) return null;
  const recharge = /\(Recharge (\d)(?:–6)?\)/.exec(entry.name);
  const perDay = /\((\d)\/Day\)/.exec(entry.name);
  const name = entry.name.replace(/ \(.*\)$/, '');
  return {
    actionId: slugOf(name),
    name,
    ability: ABILITY_IDS[match[1] ?? ''] ?? 'dex',
    dc: Number(match[2]),
    area,
    reachFt: area ? null : Number(single?.[1] ?? 5),
    rangeFt: sphere ? Number(sphere[2]) : null,
    damage: damage.filter((one): one is Damage => one !== null),
    onSuccess: match[10] === 'Half damage' ? 'half' : 'none',
    recharge: recharge ? Number(recharge[1]) : null,
    perDay: perDay ? Number(perDay[1]) : null,
  };
}

/** "makes two Rend attacks", "one Bite attack and two Claw attacks" → how many in all. */
export function multiattackOf(text: string | undefined): number {
  if (!text) return 1;
  // Its first sentence counts; "It can replace one attack with…" adds none.
  const first = text.split('. ')[0] ?? text;
  const counts = [...first.matchAll(/\b(one|two|three|four|five) (?:[A-Z][\w’' ]*? )?attacks?\b/g)];
  const total = counts.reduce((sum, match) => sum + (WORDS[match[1] ?? ''] ?? 0), 0);
  return Math.min(4, Math.max(1, total));
}

export function deriveMonsterMechanics(monster: SrdMonsterText): MonsterMechanics {
  const immune = defenses(monster.immunities);
  const resistant = defenses(monster.resistances);
  const vulnerable = defenses(monster.vulnerabilities);
  const { walk, speeds } = speedsOf(monster.speed);
  const senses = sensesOf(monster.senses);
  const attacks = monster.actions.flatMap(attacksOf);
  // The engine holds eight attacks at most, each id once.
  const unique = attacks
    .filter((one, index) => attacks.findIndex((other) => other.attackId === one.attackId) === index)
    .slice(0, 8);
  const abilities = Object.fromEntries(
    Object.entries(monster.abilities).map(([key, line]) => [key, line.score]),
  );
  const saveBonus = Object.fromEntries(
    Object.entries(monster.abilities).map(([key, line]) => [key, line.save]),
  );
  const multiattack = monster.actions.find((entry) => entry.name.startsWith('Multiattack'));
  const saves = [...monster.actions, ...monster.bonusActions]
    .map(saveActionOf)
    .filter((one): one is SaveAction => one !== null)
    .slice(0, 6);
  return {
    monsterId: monster.monsterId,
    statBlock: {
      armorClass: monster.armorClass,
      hitPoints: { max: monster.hitPoints.average, current: monster.hitPoints.average },
      ...(resistant.damage.length > 0 ? { resistances: resistant.damage } : {}),
      ...(vulnerable.damage.length > 0 ? { vulnerabilities: vulnerable.damage } : {}),
      ...(immune.damage.length > 0 ? { immunities: immune.damage } : {}),
      ...(immune.conditions.length > 0 ? { conditionImmunities: immune.conditions } : {}),
      speedFt: walk,
      size: (/^\w+/.exec(monster.size)?.[0] ?? 'Medium').toLowerCase(),
      ...(Object.keys(speeds).length > 0 ? { speeds } : {}),
      ...(Object.keys(senses).length > 0 ? { senses } : {}),
      abilities,
      savingThrows: saveBonus,
      initiativeBonus: monster.initiative.modifier,
      attacksPerAction: unique.length > 0 ? multiattackOf(multiattack?.text) : 1,
      attacks: unique,
      ...(saves.length > 0 ? { saveActions: saves } : {}),
      spells: [],
      conditions: [],
    },
    read: [...new Set([...attacks.map((one) => one.name), ...saves.map((one) => one.name)])],
  };
}
