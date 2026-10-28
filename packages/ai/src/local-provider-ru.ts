import type { EntityRef, ProposableCommand } from '@ltw/contracts';

import type { LocalInterpretation } from './local-provider.ts';

/**
 * The offline interpreter's Russian phrasings (docs/adr/0031-play-language.md §8). It
 * understands a short, documented list and nothing else; anything more is for a live
 * model (Stage 300) and degrades to "no interpretation" as ADR 0017 requires.
 *
 *   Добавь: молодой стражник у Северные ворота, который видел, как ушёл караван.
 *   Переместить Орин Стоунберд в Рыночная площадь.     (any grammatical case of the names)
 *   Орин Стоунберд погиб.
 *   Продвинь время на 3 часа.
 *
 * Names are matched by the first five letters of each word, so a name still counts when
 * the DM writes it in another case ("у Северных ворот").
 */
const PEOPLE = [
  { name: 'Томас Рид', id: 'tomas-reed' },
  { name: 'Ада Брук', id: 'ada-brook' },
  { name: 'Виль Харроу', id: 'wil-harrow' },
  { name: 'Нелл Карвер', id: 'nell-carver' },
  { name: 'Брэм Талл', id: 'bram-tull' },
  { name: 'Иса Фенн', id: 'isa-fenn' },
];

const SHORT_NAMED: ReadonlySet<EntityRef['kind']> = new Set([
  'npc',
  'character',
  'creature',
  'item',
]);
const STEM = 5;
const stems = (text: string) =>
  (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).map((word) => word.slice(0, STEM));

function contains(haystack: readonly string[], needle: readonly string[]): number {
  if (needle.length === 0) return -1;
  for (let at = 0; at + needle.length <= haystack.length; at += 1) {
    if (needle.every((word, index) => haystack[at + index] === word)) return at;
  }
  return -1;
}

/** Directory entities named in `text`, longest mention first; a mention inside a longer one does not count. */
function mentionedRu(text: string, directory: readonly EntityRef[]): EntityRef[] {
  const words = stems(text);
  const lastWords = new Map<string, number>();
  for (const entity of directory) {
    const last = stems(entity.name).at(-1) ?? '';
    lastWords.set(last, (lastWords.get(last) ?? 0) + 1);
  }
  const found = directory.flatMap((entity) => {
    const full = stems(entity.name);
    const last = full.at(-1) ?? '';
    const aliases = [full];
    if (SHORT_NAMED.has(entity.kind) && full.length > 1 && lastWords.get(last) === 1) {
      aliases.push([last]);
    }
    for (const alias of aliases) {
      const start = contains(words, alias);
      if (start >= 0) return [{ entity, start, end: start + alias.length }];
    }
    return [];
  });
  return found
    .filter(
      (a) =>
        !found.some(
          (b) =>
            b !== a && b.start <= a.start && a.end <= b.end && b.end - b.start > a.end - a.start,
        ),
    )
    .sort((a, b) => b.end - b.start - (a.end - a.start))
    .map((match) => match.entity);
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Whether the DM's words say the person keeps what they know to themselves (owner decisions 11,
 * round 2): only then is the account GUARDED; otherwise they tell it when asked.
 */
const RETICENT =
  /(?<![\p{L}])(?:скрыва|утаива|умалчива|неохотно|не\s+скаж|не\s+расскаж|не\s+говор|молч|тайн|секрет|не\s+хочет\s+(?:говорить|рассказывать))/iu;

function addPerson(text: string, directory: readonly EntityRef[]): ProposableCommand[] | null {
  const match =
    /(?:добавь|создай|введи)\s*:?\s+(.+?)\s+(?:у|возле|около|рядом с|в|на)\s+(.+?)(?:\s*,\s*(?:который|которая|что)\s+(.+?))?[.!]?$/iu.exec(
      text.trim(),
    );
  if (!match) return null;
  const [, role = '', where = '', witnessed] = match;
  const location = mentionedRu(where, directory).find((entity) => entity.kind === 'location');
  if (!location) return null;
  const taken = new Set(
    directory.flatMap((entity) => [entity.entityId, entity.name.toLowerCase()]),
  );
  const person = PEOPLE.find(({ name, id }) => !taken.has(name.toLowerCase()) && !taken.has(id));
  if (!person) return null;
  const commands: ProposableCommand[] = [
    {
      type: 'CreateEntity',
      entityId: person.id,
      kind: 'npc',
      name: person.name,
      description: `${capital(role.trim())}.`,
      existsSince: null,
      placement: { locationId: location.entityId, since: null },
    },
  ];
  if (witnessed) {
    const subjects = mentionedRu(witnessed, directory).map((entity) => entity.entityId);
    const knowledgeId = `${person.id}-account`;
    commands.push({
      type: 'AddKnowledge',
      knowledgeId,
      scope: { kind: 'NPC', npcId: person.id },
      knowledgeType: 'TESTIMONY',
      // Nominal wording: no verb agrees with the name's gender (ADR 0031 §5).
      statement: `Свидетель: ${person.name}. ${capital(witnessed.trim().replace(/[.!]+$/, ''))}.`,
      subjects: [...new Set([...subjects, location.entityId])],
      attributedTo: person.id,
      knownSince: null,
    });
    // Always explicit: never left GUARDED by default (owner decisions 11, round 2).
    commands.push({
      type: 'SetDisclosure',
      knowledgeId,
      disclosure: RETICENT.test(text) ? 'GUARDED' : 'WILLING',
    });
  }
  return commands;
}

function killed(text: string, directory: readonly EntityRef[]): ProposableCommand[] | null {
  if (!/(?<![\p{L}])(?:погиб|убит|убей|мёртв|мертв|умер)/iu.test(text)) return null;
  const [who] = mentionedRu(text, directory).filter((entity) => entity.kind !== 'location');
  return who ? [{ type: 'ChangeEntityStatus', entityId: who.entityId, status: 'dead' }] : null;
}

function moved(text: string, directory: readonly EntityRef[]): ProposableCommand[] | null {
  const match = /(?:перемести(?:ть)?|отправь)\s+(.+?)\s+(?:в|на|к)\s+(.+?)[.!]?$/iu.exec(
    text.trim(),
  );
  if (!match) return null;
  const [who] = mentionedRu(match[1] ?? '', directory).filter(
    (entity) => entity.kind !== 'location',
  );
  const [where] = mentionedRu(match[2] ?? '', directory).filter(
    (entity) => entity.kind === 'location',
  );
  return who && where
    ? [{ type: 'PlaceEntity', entityId: who.entityId, locationId: where.entityId }]
    : null;
}

const UNITS: readonly [RegExp, number][] = [
  [/^мин/iu, 60],
  [/^час/iu, 3_600],
  [/^(?:дн|ден|сут)/iu, 86_400],
];

function advanced(text: string): ProposableCommand[] | null {
  const match = /(?:продвинь|сдвинь|пропусти)\s+время\s+на\s+(\d+)\s+(\p{L}+)/iu.exec(text);
  if (!match) return null;
  const unit = UNITS.find(([pattern]) => pattern.test(match[2] ?? ''));
  return unit ? [{ type: 'AdvanceWorldTime', by: Number(match[1]) * unit[1] }] : null;
}

export function interpretRussian(
  text: string,
  directory: readonly EntityRef[],
): LocalInterpretation {
  const commands =
    addPerson(text, directory) ??
    moved(text, directory) ??
    killed(text, directory) ??
    advanced(text);
  return commands
    ? { summary: `Предложено по запросу: ${text.trim().slice(0, 200)}`, commands }
    : { summary: 'Для этого запроса нет толкования.', commands: [] };
}
