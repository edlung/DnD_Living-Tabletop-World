import type { EntityRef, ProposableCommand } from '@ltw/contracts';

import { replyLocally } from './local-dialogue.ts';
import { interpretRussian } from './local-provider-ru.ts';
import { ProviderError, type AiProvider, type ProviderRequest } from './providers.ts';

/**
 * The deterministic local provider (docs/adr/0017-ai-gateway.md §2): an
 * offline interpreter of a few slice phrasings, and NPC replies from
 * templates (`local-dialogue.ts`, ADR 0020 §3), for tests, development
 * without a key, and fallback. It reads only the structured task, so it can
 * never see more than an external provider would. It answers the same
 * request the same way.
 */
export const LOCAL_MODEL = 'local-interpreter-1';

/** Names for new people, taken in order; the first free one is used. */
const NAMES = ['Tomas Reed', 'Ada Brook', 'Wil Harrow', 'Nell Carver', 'Bram Tull', 'Isa Fenn'];

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Kinds that may be named by their last word alone ("the caravan", "Thorne"). */
const SHORT_NAMED: ReadonlySet<EntityRef['kind']> = new Set([
  'npc',
  'character',
  'creature',
  'item',
]);

/**
 * How each name may be written: in full; by its last two words when it has
 * more; and, for people and things, by its last word when that word is long
 * and no other directory name ends with it.
 */
function aliasesOf(directory: readonly EntityRef[]): Map<EntityRef, string[]> {
  const words = (name: string) => name.toLowerCase().split(/\s+/);
  const endings = new Map<string, number>();
  for (const entity of directory) {
    const last = words(entity.name).at(-1) ?? '';
    endings.set(last, (endings.get(last) ?? 0) + 1);
  }
  return new Map(
    directory.map((entity) => {
      const name = words(entity.name);
      const last = name.at(-1) ?? '';
      const short =
        SHORT_NAMED.has(entity.kind) &&
        name.length > 1 &&
        last.length >= 5 &&
        endings.get(last) === 1;
      return [
        entity,
        [
          name.join(' '),
          ...(name.length > 2 ? [name.slice(-2).join(' ')] : []),
          ...(short ? [last] : []),
        ],
      ];
    }),
  );
}

/**
 * Directory entities named in `text`, longest mention first. A mention
 * inside a longer one does not count ("Merchant Guild caravan" is not also
 * the Merchant Guild).
 */
function mentioned(text: string, directory: readonly EntityRef[]): EntityRef[] {
  const lower = text.toLowerCase();
  const aliases = aliasesOf(directory);
  const found = directory.flatMap((entity) => {
    const spans = (aliases.get(entity) ?? []).flatMap((alias) => {
      const at = lower.indexOf(alias);
      return at < 0 ? [] : [{ entity, start: at, end: at + alias.length }];
    });
    return spans.slice(0, 1);
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

function addPerson(text: string, directory: readonly EntityRef[]): ProposableCommand[] | null {
  const match =
    /\b(?:add|create|introduce)\s+(?:an?\s+)?(.+?)\s+(?:near|at|in|by|outside)\s+(?:the\s+)?(.+?)(?:\s*,?\s+who\s+(.+?))?[.!]?$/i.exec(
      text.trim(),
    );
  if (!match) return null;
  const [, role = '', where = '', witnessed] = match;
  const location = mentioned(where, directory).find((e) => e.kind === 'location');
  if (!location) return null;
  const taken = new Set(directory.flatMap((e) => [e.entityId, e.name.toLowerCase()]));
  const name = NAMES.find((n) => !taken.has(n.toLowerCase()) && !taken.has(slug(n)));
  if (!name) return null;
  const npcId = slug(name);
  const commands: ProposableCommand[] = [
    {
      type: 'CreateEntity',
      entityId: npcId,
      kind: 'npc',
      name,
      description: `A ${role.trim().toLowerCase()}.`,
      existsSince: null,
      placement: { locationId: location.entityId, since: null },
    },
  ];
  if (witnessed) {
    const subjects = mentioned(witnessed, directory).map((e) => e.entityId);
    commands.push({
      type: 'AddKnowledge',
      scope: { kind: 'NPC', npcId },
      knowledgeType: 'TESTIMONY',
      statement: `${name} ${witnessed.trim().replace(/[.!]+$/, '')}.`,
      subjects: [...new Set([...subjects, location.entityId])],
      attributedTo: npcId,
      knownSince: null,
    });
  }
  return commands;
}

function killed(text: string, directory: readonly EntityRef[]): ProposableCommand[] | null {
  if (!/\b(?:is dead|has died|was killed|dies|kill)\b/i.test(text)) return null;
  const [who] = mentioned(text, directory).filter((e) => e.kind !== 'location');
  return who ? [{ type: 'ChangeEntityStatus', entityId: who.entityId, status: 'dead' }] : null;
}

function moved(text: string, directory: readonly EntityRef[]): ProposableCommand[] | null {
  const match = /\bmove\s+(.+?)\s+to\s+(.+?)[.!]?$/i.exec(text.trim());
  if (!match) return null;
  const [who] = mentioned(match[1] ?? '', directory).filter((e) => e.kind !== 'location');
  const [where] = mentioned(match[2] ?? '', directory).filter((e) => e.kind === 'location');
  return who && where
    ? [{ type: 'PlaceEntity', entityId: who.entityId, locationId: where.entityId }]
    : null;
}

const SECONDS = { minute: 60, hour: 3_600, day: 86_400 } as const;

function advanced(text: string): ProposableCommand[] | null {
  const match = /\badvance\s+(?:the\s+)?time\s+by\s+(\d+)\s+(minute|hour|day)s?\b/i.exec(text);
  if (!match) return null;
  const unit = (match[2] ?? 'hour').toLowerCase() as keyof typeof SECONDS;
  return [{ type: 'AdvanceWorldTime', by: Number(match[1]) * SECONDS[unit] }];
}

export function interpretLocally(text: string, directory: readonly EntityRef[]): unknown {
  // A request written in Cyrillic is read by the Russian phrasings (ADR 0031 §8).
  if (/[\u0400-\u04FF]/u.test(text)) return interpretRussian(text, directory);
  const commands =
    addPerson(text, directory) ??
    moved(text, directory) ??
    killed(text, directory) ??
    advanced(text);
  return commands
    ? { summary: `Proposed from: ${text.trim().slice(0, 200)}`, commands }
    : { summary: 'No interpretation for this request.', commands: [] };
}

export function createLocalProvider(): AiProvider {
  return {
    id: 'local',
    generate: (request: ProviderRequest) => {
      const { task } = request;
      // Relevance has no local ranker: its deterministic fallback is the Context Engine (ADR 0021).
      if (task.kind === 'relevance') {
        return Promise.reject(new ProviderError('UNAVAILABLE', 'no local relevance ranker'));
      }
      // The local chronicle writer is the deterministic template (ADR 0024 §3).
      if (task.kind === 'chronicle') {
        return Promise.resolve({
          output: { paragraphs: task.prompt.template.map((p) => ({ ...p, cites: [...p.cites] })) },
          model: LOCAL_MODEL,
          usage: null,
        });
      }
      return Promise.resolve({
        output:
          task.kind === 'npc-dialogue'
            ? replyLocally(task.prompt)
            : interpretLocally(task.text, task.context.entities),
        model: LOCAL_MODEL,
        usage: null,
      });
    },
  };
}
