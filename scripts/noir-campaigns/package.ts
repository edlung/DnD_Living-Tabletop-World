import {
  campaignPackageSchema,
  type CampaignEntity,
  type CampaignKnowledge,
  type CampaignPackage,
  toNpcManner,
} from '../../packages/contracts/src/index.ts';
import { encounterFoes, buildEncounters } from './encounters.ts';
import { verifySource } from './editorial.ts';
import { heroSheet } from './sheets.ts';
import type { Source } from './source.ts';
import { caseRecords } from './detective.ts';
import { buildQuests } from '../campaign-shared/quests.ts';

const placed = (
  key: string,
  name: string,
  kind: CampaignEntity['kind'],
  location: string,
  description: string,
): CampaignEntity => ({
  key,
  name,
  kind,
  description,
  status: 'active',
  existsSince: null,
  placement: { location, since: null },
});
const record = (
  key: string,
  scope: CampaignKnowledge['scope'],
  statement: string,
  subjects: string[] = [],
): CampaignKnowledge => ({
  key,
  scope,
  statement,
  subjects,
  knowledgeType: scope.kind === 'WORLD_TRUTH' ? 'SECRET' : 'FACT',
  knownSince: null,
  relations: [],
});

/** An NPC's authored voice as its public manner of speech, when it has one (ADR 0020 amendment 2026-11-14). */
const mannerOf = (voice: string | undefined): Pick<CampaignEntity, 'manner'> => {
  const manner = toNpcManner(voice);
  return manner === undefined ? {} : { manner };
};

/** Authored preparation only: no provider provenance, invitations, controller or played outcome. */
export function buildPackage(s: Source, size = s.world.defaultPlayers): CampaignPackage {
  verifySource(s);
  const { world: w, cast } = s;
  if (!Number.isInteger(size) || size < w.minPlayers || size > w.maxPlayers)
    throw new Error(`Unsupported party size ${size}`);
  const heroes = cast.heroes.slice(0, size);
  const party = heroes.map((h) => h.key);
  const gear = heroes.map((h) => ({
    key: `${h.key}-travel-kit`,
    holder: h.key,
    name: `Рабочий набор: ${h.name}`,
  }));
  const entities: CampaignEntity[] = [
    ...w.locations.map((l): CampaignEntity => ({
      key: l.key,
      name: l.name,
      kind: 'location',
      description: l.description,
      status: 'active',
      existsSince: null,
      location: { type: l.type, parent: l.parent },
    })),
    ...heroes.map((h) => ({
      ...placed(h.key, h.name, 'character', w.startLocation, `${h.look} ${h.role}. ${h.hook}`),
      sheet: heroSheet(h.archetype),
    })),
    ...cast.npcs.map((n) => ({
      ...placed(n.key, n.name, 'npc', n.location, `${n.look} ${n.public}`),
      ...mannerOf(n.voice),
      status: n.status ?? 'active',
    })),
    ...s.clues.map((c) => placed(`e-${c.key}`, c.name, 'feature', c.location, c.appearance)),
    ...gear.map((g): CampaignEntity => ({
      key: g.key,
      name: g.name,
      kind: 'item',
      description:
        'Личные принадлежности для расследования; состав согласуют с ведущим. Набор не даёт автоматических бонусов.',
      status: 'active',
      existsSince: null,
    })),
    ...s.items
      .filter((item) => item.location !== null || party.includes(item.holder ?? ''))
      .map((item): CampaignEntity =>
        item.location !== null
          ? placed(item.key, item.name, 'item', item.location, item.description)
          : {
              key: item.key,
              name: item.name,
              kind: 'item',
              description: item.description,
              status: 'active',
              existsSince: null,
            },
      ),
    ...encounterFoes(s, size),
  ];
  const knowledge: CampaignKnowledge[] = [
    ...caseRecords(s),
    record('public-premise', { kind: 'PUBLIC' }, w.pitch, [w.startLocation]),
    record('party-opening', { kind: 'PARTY' }, w.opening, party),
    ...heroes.flatMap((h) => [
      record(`${h.key}-bond`, { kind: 'CHARACTER', holder: h.key }, h.bond, [h.key]),
      record(`${h.key}-question`, { kind: 'CHARACTER', holder: h.key }, h.personalQuestion, [
        h.key,
      ]),
      record(`${h.key}-spotlight`, { kind: 'CHARACTER', holder: h.key }, h.spotlight, [h.key]),
    ]),
    ...w.truth.map((truth, i) => record(`truth-${i + 1}`, { kind: 'WORLD_TRUTH' }, truth)),
    ...cast.npcs.flatMap((n): CampaignKnowledge[] => [
      ...n.knows.map((statement, i): CampaignKnowledge => ({
        ...record(`${n.key}-knows-${i + 1}`, { kind: 'NPC', holder: n.key }, statement, [n.key]),
        knowledgeType: 'TESTIMONY',
        attributedTo: n.key,
        // Authored knows is private awareness, not consent to disclose on the first question.
        // Release conditions are in the DM book; no confession is required to obtain clues.
        disclosure: 'GUARDED',
      })),
      {
        ...record(`${n.key}-private`, { kind: 'NPC', holder: n.key }, n.secret, [n.key]),
        knowledgeType: 'SECRET',
        disclosure: 'GUARDED',
      },
      record(`${n.key}-want`, { kind: 'DM' }, n.want, [n.key]),
      record(`${n.key}-boundary`, { kind: 'DM' }, n.boundary, [n.key]),
      record(`${n.key}-reveal`, { kind: 'DM' }, n.reveal, [n.key]),
    ]),
    ...w.endings.flatMap((e, i) => [
      record(`ending-${i + 1}-condition`, { kind: 'DM' }, `${e.title}. Условия: ${e.requires}`),
      record(`ending-${i + 1}-outcome`, { kind: 'DM' }, e.outcome),
      record(`ending-${i + 1}-cost`, { kind: 'DM' }, e.cost),
    ]),
    ...s.items.map((item) =>
      record(`${item.key}-use`, { kind: 'DM' }, `${item.name}: ${item.use}`, [item.key]),
    ),
    ...s.handouts.flatMap((h) => [
      record(`${h.key}-release`, { kind: 'DM' }, `${h.title}. Выдать только когда: ${h.unlock}`),
      record(`${h.key}-text`, { kind: 'DM' }, h.text),
    ]),
    ...s.clues.flatMap((c) => [
      record(`${c.key}-discovery`, { kind: 'DM' }, c.discovery, [`e-${c.key}`]),
      record(`${c.key}-fallback`, { kind: 'DM' }, c.fallback, [`e-${c.key}`]),
    ]),
  ];
  return campaignPackageSchema.parse({
    schemaVersion: 1,
    brief: {
      intent: w.pitch,
      setting: w.setting,
      tone: w.tone,
      duration: `${s.sessions.length} сессий; ${w.sessionDuration}`,
      partySize: size,
      partyLevel: 3,
      include: [`${size} игроков + ведущий`, `Аудитория ${w.audience}`, ...w.themes],
      exclude: w.boundaries,
    },
    world: {
      name: w.title,
      worldName: w.worldName,
      language: 'ru',
      startsAt: (w.startHour ?? 9) * 3600,
      startLocation: w.startLocation,
      weather: w.weather ?? 'overcast',
      opening: w.opening,
    },
    entities,
    party,
    knowledge,
    relationships: cast.npcs.map((n) => ({ npc: n.key, attitude: 'NEUTRAL' })),
    possessions: [
      ...gear.map((g) => ({ item: g.key, holder: g.holder, quantity: 1 })),
      ...s.items
        .filter((item) => item.holder !== null && party.includes(item.holder))
        .map((item) => ({ item: item.key, holder: item.holder ?? '', quantity: 1 })),
    ],
    clues: s.clues.map((c) => ({
      key: c.key,
      entity: `e-${c.key}`,
      method: 'inspect',
      statement: c.statement,
      subjects: c.subjects,
    })),
    conflicts: [
      {
        key: 'central-conflict',
        title: w.title,
        description: w.truth[0],
        actors: cast.npcs.map((n) => n.key),
        stakes: w.tone,
      },
    ],
    situations: s.sessions.flatMap((session) => [
      {
        key: session.key,
        title: session.title,
        location: session.location,
        description: `${session.goal} ${session.readAloud}`,
        hooks: [session.dmNote, ...session.spotlight],
        participants: session.participants,
        clueKeys: session.clues,
        approaches: session.scenes.flatMap((scene) => scene.choices),
        developments: session.consequences,
      },
      ...session.scenes.map((scene, i) => ({
        key: `${session.key}-scene-${i + 1}`,
        title: scene.title,
        location: session.location,
        description: scene.play,
        hooks: [scene.check, `Неудача: ${scene.failForward}`],
        participants: session.participants,
        clueKeys: session.clues,
        approaches: scene.choices,
        developments: [],
      })),
    ]),
    encounters: buildEncounters(s, party),
    quests: buildQuests(s),
    visuals: entities
      .filter(
        (e) =>
          ['location', 'npc', 'character'].includes(e.kind) || s.items.some((i) => i.key === e.key),
      )
      .map((e) => ({
        entity: e.key,
        purpose: 'image',
        description: e.description,
        style:
          'Самостоятельная жанровая иллюстрация без подписей и скрытых сюжетных сведений. Это задание, не готовое изображение.',
      })),
    firstSession: s.sessions[0]?.scenes.map((scene) => `${scene.title}. ${scene.play}`) ?? [],
    laterOutline: s.sessions
      .slice(1)
      .map((session) => `${session.title}. ${session.goal} ${session.dmNote}`),
  });
}
