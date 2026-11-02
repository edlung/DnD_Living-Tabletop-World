import { joinLines, properName, slugOf } from './text.ts';

/**
 * The SRD's spell descriptions (pages 107–175) as entries (docs/adr/0051-srd-data.md §3): the
 * text layer — name, level, school, classes, casting time, range, components, duration, the
 * description and what a higher slot or a cantrip's level adds. A header it cannot read throws.
 */
export const SCHOOLS = [
  'Abjuration',
  'Conjuration',
  'Divination',
  'Enchantment',
  'Evocation',
  'Illusion',
  'Necromancy',
  'Transmutation',
] as const;

export interface SrdSpellText {
  readonly spellId: string;
  readonly name: string;
  readonly level: number;
  readonly school: string;
  readonly classes: readonly string[];
  readonly castingTime: string;
  readonly ritual: boolean;
  readonly range: string;
  readonly components: {
    readonly verbal: boolean;
    readonly somatic: boolean;
    readonly material: string | null;
    /** A material with a price, in GP; consumed when the spell says so. */
    readonly costGp: number | null;
    readonly consumed: boolean;
  };
  readonly duration: string;
  readonly concentration: boolean;
  readonly description: string;
  /** "Using a Higher-Level Spell Slot." or "Cantrip Upgrade." */
  readonly higherLevels: string | null;
}

const SCHOOL = SCHOOLS.join('|');
const HEADER = new RegExp(`^(?:Level (\\d) (${SCHOOL})|(${SCHOOL}) Cantrip) \\((.*)$`);

/** Splits the spell pages into entries and reads each. */
export function parseSpells(lines: readonly string[]): SrdSpellText[] {
  const starts: number[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    if (HEADER.test(lines[index] ?? '')) starts.push(index - 1);
  }
  return starts.map((start, n) => readSpell(lines.slice(start, starts[n + 1] ?? lines.length)));
}

/** A header field; the SRD once writes "Component:" for "Components:" (Barkskin). */
function field(lines: readonly string[], label: string): { value: string; next: number } {
  const pattern = new RegExp(`^${label === 'Components' ? 'Components?' : label}:`);
  const at = lines.findIndex((line) => pattern.test(line));
  if (at < 0) throw new Error(`spell "${lines[0] ?? ''}" has no ${label}`);
  let value = (lines[at] ?? '').replace(pattern, '').trim();
  let next = at + 1;
  // A field that wraps runs to the next field; the last, Duration, only while its next line
  // starts lowercase or continues a parenthesis.
  const last = label === 'Duration';
  while (
    next < lines.length &&
    !/^(Casting Time|Range|Components?|Duration):/.test(lines[next] ?? '')
  ) {
    const line = lines[next] ?? '';
    const open = (value.match(/\(/g) ?? []).length > (value.match(/\)/g) ?? []).length;
    if (last && !open && !/^[a-z(]/.test(line)) break;
    value = joinLines([value, line]);
    next += 1;
  }
  return { value, next };
}

function readSpell(lines: readonly string[]): SrdSpellText {
  const name = properName(lines[0] ?? '');
  let header = lines[1] ?? '';
  let cursor = 2;
  while (!header.endsWith(')') && cursor < lines.length) {
    header = `${header} ${lines[cursor] ?? ''}`;
    cursor += 1;
  }
  const match = HEADER.exec(header);
  if (!match) throw new Error(`spell "${name}" has an unreadable header: ${header}`);
  const level = match[1] === undefined ? 0 : Number(match[1]);
  const school = (match[2] ?? match[3] ?? '').toLowerCase();
  const classes = (match[4] ?? '')
    .replace(/\)$/, '')
    .split(',')
    .map((one) => one.trim().toLowerCase())
    .filter(Boolean);
  const casting = field(lines, 'Casting Time');
  const range = field(lines, 'Range');
  const components = field(lines, 'Components');
  const duration = field(lines, 'Duration');
  const body = lines.slice(duration.next);
  const higherAt = body.findIndex((line) =>
    /^(Using a Higher-Level Spell Slot|Cantrip Upgrade)\./.test(line),
  );
  const descriptionLines = higherAt < 0 ? body : body.slice(0, higherAt);
  const higher = higherAt < 0 ? null : joinLines(body.slice(higherAt));
  const material = /M \((.*)\)$/.exec(components.value)?.[1] ?? null;
  const cost = material ? /([\d,]+)\+? GP/.exec(material) : null;
  return {
    spellId: slugOf(name),
    name,
    level,
    school,
    classes,
    castingTime: casting.value.replace(/ or Ritual$/, ''),
    ritual: / or Ritual$/.test(casting.value),
    range: range.value,
    components: {
      verbal: /(^|, )V(,|$| )/.test(components.value),
      somatic: /(^|, )S(,|$| )/.test(components.value),
      material,
      costGp: cost ? Number((cost[1] ?? '0').replace(/,/g, '')) : null,
      consumed: material !== null && /consume/i.test(material),
    },
    duration: duration.value,
    concentration: /^Concentration/.test(duration.value),
    description: paragraphs(descriptionLines),
    higherLevels: higher,
  };
}

/**
 * Running text kept in paragraphs where the SRD starts one with a bold run-in heading ("Audible
 * Alarm. …") or a list line, after a line that ended its sentence; otherwise wrapped lines join.
 */
export function paragraphs(lines: readonly string[]): string {
  const blocks: string[][] = [];
  for (const line of lines) {
    const last = blocks[blocks.length - 1];
    const ended = last === undefined || /[.:!?)”]$/.test(last[last.length - 1] ?? '');
    // A list line always opens one; a run-in heading only after a sentence's end.
    if (last === undefined || /^•/.test(line) || (ended && runInHeading(line))) blocks.push([line]);
    else last.push(line);
  }
  return blocks.map((block) => joinLines(block)).join('\n');
}

const SMALL_WORDS = new Set([
  'a',
  'an',
  'and',
  'by',
  'for',
  'from',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
]);

/** "Audible Alarm. The…": a few capitalized words, a period, then a sentence. */
function runInHeading(line: string): boolean {
  const match = /^([A-Z][A-Za-z’' -]{1,40})\. [A-Z]/.exec(line);
  if (!match) return false;
  const words = (match[1] ?? '').split(/[ -]/);
  return words.length <= 5 && words.every((word) => /^[A-Z]/.test(word) || SMALL_WORDS.has(word));
}
