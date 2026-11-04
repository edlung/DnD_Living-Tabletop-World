import { joinLines, properName, slugOf, type SrdLine } from './text.ts';

/**
 * The SRD's stat blocks (Monsters A–Z, pages 258–343, and Animals, 344–364) as entries
 * (docs/adr/0051-srd-data.md §3): the text layer of each line of a stat block, its traits, actions,
 * bonus actions, reactions and legendary actions as named entries. A block it cannot read throws.
 */
export interface SrdAbilityLine {
  readonly score: number;
  readonly modifier: number;
  readonly save: number;
}

export interface SrdEntry {
  readonly name: string;
  readonly text: string;
}

export interface SrdMonsterText {
  readonly monsterId: string;
  readonly name: string;
  /** "Medium", "Medium or Small", "Huge". */
  readonly size: string;
  readonly type: string;
  readonly alignment: string;
  readonly armorClass: number;
  readonly initiative: { readonly modifier: number; readonly score: number };
  readonly hitPoints: { readonly average: number; readonly dice: string };
  readonly speed: string;
  readonly abilities: Readonly<
    Record<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', SrdAbilityLine>
  >;
  readonly skills: string | null;
  readonly vulnerabilities: string | null;
  readonly resistances: string | null;
  readonly immunities: string | null;
  readonly gear: string | null;
  readonly senses: string;
  readonly languages: string;
  readonly challenge: {
    readonly rating: string;
    readonly xp: number;
    readonly xpInLair: number | null;
    readonly proficiency: number;
  };
  readonly traits: readonly SrdEntry[];
  readonly actions: readonly SrdEntry[];
  readonly bonusActions: readonly SrdEntry[];
  readonly reactions: readonly SrdEntry[];
  readonly legendary: { readonly uses: string; readonly entries: readonly SrdEntry[] } | null;
}

const SECTIONS = ['Traits', 'Actions', 'Bonus Actions', 'Reactions', 'Legendary Actions'] as const;
type Section = (typeof SECTIONS)[number];

const number = (raw: string): number => Number(raw.replace('−', '-').replace('+', ''));

/** Splits the monster pages into stat blocks: each starts two lines before its "AC" line. */
export function parseMonsters(lines: readonly SrdLine[]): SrdMonsterText[] {
  const starts: number[] = [];
  for (let index = 2; index < lines.length; index += 1) {
    if (
      /^AC \d+/.test(lines[index]?.text ?? '') &&
      /^(Tiny|Small|Medium|Large|Huge|Gargantuan)\b/.test(lines[index - 1]?.text ?? '')
    ) {
      starts.push(index - 2);
    }
  }
  return starts.map((start, n) => {
    // The block runs to the next one's name (the import drops group headings by their size).
    const block = lines.slice(start, starts[n + 1] ?? lines.length);
    const fixes = MISPRINTS[properName(block[0]?.text ?? '')] ?? [];
    return readMonster(
      block.map((one) => {
        const fixed = fixes.find(([printed]) => printed === one.text)?.[1];
        return fixed === undefined ? one : { ...one, text: fixed };
      }),
    );
  });
}

/** Lines of the SRD 5.2.1's stat blocks misprinted, by block: the line as printed, as meant. */
const MISPRINTS: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  // CR 12 is worth 8,400 XP.
  Archmage: [['CR 12 (XP 8,000; PB +4)', 'CR 12 (XP 8,400; PB +4)']],
  // The Initiative score is 10 + the modifier.
  'Gray Ooze': [['AC 9 Initiative −2 (13)', 'AC 9 Initiative −2 (8)']],
  'Invisible Stalker': [['AC 14 Initiative +7 (22)', 'AC 14 Initiative +7 (17)']],
  // The Intelligence save lost its minus sign: no proficiency, −2.
  'Young White Dragon': [
    ['Int 6 −2 2 WIS 11 +0 +3 Cha 12 +1 +1', 'Int 6 −2 −2 WIS 11 +0 +3 Cha 12 +1 +1'],
  ],
};

function line(lines: readonly string[], prefix: string): string | null {
  const found = lines.find((one) => one.startsWith(`${prefix} `));
  return found ? found.slice(prefix.length + 1).trim() : null;
}

function readMonster(block: readonly SrdLine[]): SrdMonsterText {
  const lines = block.map((one) => one.text);
  const name = properName(lines[0] ?? '');
  const typeLine = lines[1] ?? '';
  const typeMatch =
    /^((?:Tiny|Small|Medium|Large|Huge|Gargantuan)(?: or (?:Tiny|Small|Medium|Large))?) (.+), (.+)$/.exec(
      typeLine,
    );
  if (!typeMatch) throw new Error(`monster "${name}" has an unreadable type line: ${typeLine}`);
  const ac = /^AC (\d+)(?:.*?Initiative ([+−-]\d+) \((\d+)\))?/.exec(lines[2] ?? '');
  if (!ac) throw new Error(`monster "${name}" has no AC line`);
  const hp = /^HP (\d+) \(([^)]+)\)/.exec(lines.find((one) => one.startsWith('HP ')) ?? '');
  if (!hp) throw new Error(`monster "${name}" has no HP line`);
  const abilityText = lines.filter((one) => /^(Str|Int) \d+/i.test(one)).join(' ');
  const abilities: Record<string, SrdAbilityLine> = {};
  for (const match of abilityText.matchAll(
    /(Str|Dex|Con|Int|Wis|Cha)\s+(\d+)\s+([+−-]\d+)\s+([+−-]\d+)/gi,
  )) {
    abilities[(match[1] ?? '').toLowerCase()] = {
      score: Number(match[2]),
      modifier: number(match[3] ?? '0'),
      save: number(match[4] ?? '0'),
    };
  }
  if (Object.keys(abilities).length !== 6)
    throw new Error(`monster "${name}" has unreadable abilities`);
  const crLine = line(lines, 'CR');
  // Four blocks print "(450 XP; PB +2)" for "(XP 450; PB +2)".
  const cr = crLine
    ? /^([\d/]+) \((?:XP ([\d,]+)|([\d,]+) XP)(?:, or ([\d,]+) in lair)?; PB \+(\d+)\)/.exec(crLine)
    : null;
  if (!cr) throw new Error(`monster "${name}" has an unreadable CR: ${crLine ?? 'none'}`);
  // The header ends with the CR line; the rest is sections of named entries.
  const crAt = lines.findIndex((one) => one.startsWith('CR '));
  const sections = readSections(block.slice(crAt + 1), name);
  const legendaryLines = sections.get('Legendary Actions');
  return {
    monsterId: slugOf(name),
    name,
    size: typeMatch[1] ?? '',
    type: typeMatch[2] ?? '',
    alignment: typeMatch[3] ?? '',
    armorClass: Number(ac[1]),
    initiative: {
      modifier: ac[2] === undefined ? 0 : number(ac[2]),
      score: ac[3] === undefined ? 10 : Number(ac[3]),
    },
    hitPoints: { average: Number(hp[1]), dice: (hp[2] ?? '').replace(/\s+/g, ' ') },
    speed: joinLines(header(lines, 'Speed')),
    abilities: abilities as SrdMonsterText['abilities'],
    skills: optional(lines, 'Skills'),
    vulnerabilities: optional(lines, 'Vulnerabilities'),
    resistances: optional(lines, 'Resistances'),
    immunities: optional(lines, 'Immunities'),
    gear: optional(lines, 'Gear'),
    senses: optional(lines, 'Senses') ?? '',
    languages: optional(lines, 'Languages') ?? '',
    challenge: {
      rating: cr[1] ?? '0',
      xp: Number((cr[2] ?? cr[3] ?? '0').replace(/,/g, '')),
      xpInLair: cr[4] === undefined ? null : Number(cr[4].replace(/,/g, '')),
      proficiency: Number(cr[5]),
    },
    traits: entries(sections.get('Traits')),
    actions: entries(sections.get('Actions')),
    bonusActions: entries(sections.get('Bonus Actions')),
    reactions: entries(sections.get('Reactions')),
    legendary: legendaryLines ? legendary(legendaryLines) : null,
  };
}

const HEADER_LINES =
  /^(AC|HP|Speed|MOD|Str|Int|Skills|Vulnerabilities|Resistances|Immunities|Gear|Senses|Languages|CR) /i;

/** A header line and the lines it wraps onto, up to the next header line. */
function header(lines: readonly string[], label: string): string[] {
  const at = lines.findIndex((one) => one.startsWith(`${label} `));
  if (at < 0) return [];
  const taken = [(lines[at] ?? '').slice(label.length + 1)];
  for (let next = at + 1; next < lines.length; next += 1) {
    const one = lines[next] ?? '';
    if (HEADER_LINES.test(one) || (SECTIONS as readonly string[]).includes(one)) break;
    taken.push(one);
  }
  return taken;
}

const optional = (lines: readonly string[], label: string): string | null => {
  const taken = header(lines, label);
  return taken.length === 0 ? null : joinLines(taken);
};

function readSections(lines: readonly SrdLine[], name: string): Map<Section, SrdLine[]> {
  const sections = new Map<Section, SrdLine[]>();
  let current: SrdLine[] | null = null;
  for (const one of lines) {
    if ((SECTIONS as readonly string[]).includes(one.text)) {
      current = [];
      sections.set(one.text as Section, current);
      continue;
    }
    if (current === null)
      throw new Error(`monster "${name}" has text outside a section: ${one.text}`);
    current.push(one);
  }
  return sections;
}

/**
 * Named entries: each opens with its name in bold italic, ending in a period ("Bite."); a label
 * in bold ("At Will:", "2/Day Each:") starts a paragraph of its own.
 */
function entries(lines: readonly SrdLine[] | undefined): SrdEntry[] {
  if (!lines) return [];
  const found: { name: string; paragraphs: string[][] }[] = [];
  for (const one of lines) {
    const entry = found[found.length - 1];
    if (one.lead !== null && one.lead.endsWith('.')) {
      if (!one.text.startsWith(one.lead))
        throw new Error(`an entry's name is not its line's start: ${one.text}`);
      found.push({
        name: one.lead.slice(0, -1),
        paragraphs: [[one.text.slice(one.lead.length).trim()]],
      });
    } else if (entry === undefined) {
      throw new Error(`an entry has no name: ${one.text}`);
    } else if (one.label?.endsWith(':')) {
      entry.paragraphs.push([one.text]);
    } else {
      entry.paragraphs[entry.paragraphs.length - 1]?.push(one.text);
    }
  }
  return found.map((entry) => ({
    name: entry.name,
    text: entry.paragraphs.map((paragraph) => joinLines(paragraph)).join('\n'),
  }));
}

function legendary(lines: readonly SrdLine[]): { uses: string; entries: SrdEntry[] } {
  // "Legendary Action Uses: 3 (4 in Lair). Immediately after…" runs until the first entry.
  const first = lines.findIndex((one) => one.lead !== null && one.lead.endsWith('.'));
  const opening = first < 0 ? lines : lines.slice(0, first);
  return {
    uses: joinLines(opening.map((one) => one.text)).replace(/^Legendary Action Uses: /, ''),
    entries: first < 0 ? [] : entries(lines.slice(first)),
  };
}
