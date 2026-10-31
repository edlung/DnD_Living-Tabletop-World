import {
  CAMPAIGN_EDIT_SECTIONS,
  type CampaignEditSection,
  type CampaignEditTarget,
  type CampaignRevision,
} from '@ltw/contracts';

interface TargetRecord {
  readonly targetId: string;
  readonly section: CampaignEditSection;
  readonly key: string | null;
  readonly label: string;
  readonly projection: unknown;
}

const SECTION_NAMES: Readonly<Record<CampaignEditSection, readonly [string, string]>> = {
  brief: ['Campaign brief', 'Замысел кампании'],
  world: ['World and opening', 'Мир и завязка'],
  entities: ['Cast and places', 'Персонажи и места'],
  party: ['Prepared party', 'Подготовленная группа'],
  knowledge: ['Knowledge', 'Знания'],
  relationships: ['Relationships', 'Отношения'],
  possessions: ['Starting items', 'Стартовые вещи'],
  clues: ['Clues', 'Улики'],
  conflicts: ['Conflicts', 'Конфликты'],
  situations: ['Situations', 'Ситуации'],
  encounters: ['Prepared encounters', 'Подготовленные встречи'],
  quests: ['Quests', 'Задания'],
  visuals: ['Visual briefs', 'Описания внешности'],
  firstSession: ['First session', 'Первая сессия'],
  laterOutline: ['Later developments', 'Дальнейшие события'],
};

function records(revision: CampaignRevision): TargetRecord[] {
  const { content, identities } = revision;
  const ru = content.world.language === 'ru';
  const result: TargetRecord[] = CAMPAIGN_EDIT_SECTIONS.map((section) => ({
    targetId: `section:${section}`,
    section,
    key: null,
    label: SECTION_NAMES[section][ru ? 1 : 0],
    projection: content[section] ?? [],
  }));
  const add = (
    section: CampaignEditSection,
    targetId: string | null,
    key: string,
    label: string,
    projection: unknown,
  ) => {
    if (targetId !== null) result.push({ section, targetId, key, label, projection });
  };
  for (const entity of content.entities) {
    const id = identities.entities[entity.key];
    add('entities', id ? `entity:${id}` : null, entity.key, entity.name, entity);
  }
  for (const knowledge of content.knowledge) {
    const id = identities.knowledge[knowledge.key];
    add(
      'knowledge',
      id ? `knowledge:${id}` : null,
      knowledge.key,
      knowledge.statement.slice(0, 120),
      knowledge,
    );
  }
  for (const clue of content.clues) {
    const id = identities.clues[clue.key];
    add('clues', id ? `clue:${id}` : null, clue.key, clue.statement.slice(0, 120), clue);
  }
  for (const encounter of content.encounters) {
    const id = identities.encounters[encounter.key];
    add('encounters', id ? `encounter:${id}` : null, encounter.key, encounter.title, encounter);
  }
  for (const conflict of content.conflicts)
    add('conflicts', `conflict:${conflict.key}`, conflict.key, conflict.title, conflict);
  for (const situation of content.situations)
    add('situations', `situation:${situation.key}`, situation.key, situation.title, situation);
  for (const quest of content.quests)
    add('quests', `quest:${quest.questId}`, quest.questId, quest.title, quest);
  for (const relation of content.relationships) {
    const id = identities.entities[relation.npc];
    const name =
      content.entities.find((entity) => entity.key === relation.npc)?.name ??
      SECTION_NAMES.relationships[ru ? 1 : 0];
    add('relationships', id ? `relationship:${id}` : null, relation.npc, name, relation);
  }
  for (const visual of content.visuals) {
    const id = identities.entities[visual.entity];
    const name =
      content.entities.find((entity) => entity.key === visual.entity)?.name ??
      SECTION_NAMES.visuals[ru ? 1 : 0];
    const purpose =
      visual.purpose === 'image'
        ? ru
          ? 'картинка'
          : 'picture'
        : visual.purpose === 'figure'
          ? ru
            ? 'фигурка'
            : 'figure'
          : ru
            ? 'карта боя'
            : 'battle map';
    add(
      'visuals',
      id ? `visual:${id}:${visual.purpose}` : null,
      `${visual.entity}:${visual.purpose}`,
      `${name} · ${purpose}`,
      visual,
    );
  }
  return result;
}

/** Complete owner catalog; ambiguous object IDs are marked, never silently merged as one object. */
export function campaignEditTargets(
  revision: CampaignRevision,
  locked: ReadonlySet<string> = new Set(),
): readonly CampaignEditTarget[] {
  const all = records(revision);
  const counts = new Map<string, number>();
  for (const record of all) counts.set(record.targetId, (counts.get(record.targetId) ?? 0) + 1);
  const emitted = new Set<string>();
  return all.flatMap((record) => {
    if (emitted.has(record.targetId)) return [];
    emitted.add(record.targetId);
    return [
      {
        targetId: record.targetId,
        section: record.section,
        key: record.key,
        label: record.label,
        locked: locked.has(record.targetId) || locked.has(`section:${record.section}`),
        ambiguous: (counts.get(record.targetId) ?? 0) > 1,
      },
    ];
  });
}

export function resolveCampaignEditTarget(
  revision: CampaignRevision,
  targetId: string,
): { readonly label: string; readonly projection: unknown } | null {
  const matches = records(revision).filter((record) => record.targetId === targetId);
  const record = matches.length === 1 ? matches[0] : null;
  return record ? { label: record.label, projection: structuredClone(record.projection) } : null;
}

/** Internal reference graph/validator entry; callers must not expose raw projections to players. */
export function campaignEditTargetRecords(revision: CampaignRevision): readonly TargetRecord[] {
  return records(revision);
}
