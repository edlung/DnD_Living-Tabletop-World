import type { CampaignPackage } from '@ltw/contracts';

export const SCENARIO_GROUPS = [
  'world',
  'brief',
  'situations',
  'entities',
  'conflicts',
  'clues',
  'knowledge',
  'quests',
  'encounters',
  'visuals',
  'party',
  'relationships',
  'firstSession',
  'laterOutline',
] as const;
export type ScenarioGroup = (typeof SCENARIO_GROUPS)[number];

export const GROUP_LABELS: Record<ScenarioGroup, string> = {
  world: 'Opening',
  brief: 'Campaign brief',
  situations: 'Situations',
  entities: 'Cast and places',
  conflicts: 'Motivations and conflicts',
  clues: 'Clues',
  knowledge: 'Knowledge and truth',
  quests: 'Quests',
  encounters: 'Encounters',
  visuals: 'Visual briefs',
  party: 'Prepared party',
  relationships: 'Initial attitudes',
  firstSession: 'First session',
  laterOutline: 'Later outline',
};

export interface ScenarioNode {
  readonly path: string;
  readonly group: ScenarioGroup;
  readonly title: string;
  readonly value: unknown;
  readonly ordinal: number;
}
export interface ScenarioLink {
  readonly target: string;
  readonly label: string;
}
export interface ScenarioIndex {
  readonly nodes: readonly ScenarioNode[];
  readonly byPath: ReadonlyMap<string, ScenarioNode>;
  readonly links: ReadonlyMap<string, readonly ScenarioLink[]>;
  readonly aliases: ReadonlyMap<string, string>;
}

/** Local design keys stay inside the index; every visible link uses an object's name. */
export function buildScenarioIndex(content: CampaignPackage): ScenarioIndex {
  const nodes: ScenarioNode[] = [];
  const aliases = new Map<string, string>();
  const pathCounts = new Map<string, number>();
  const groupCounts = new Map<ScenarioGroup, number>();
  const add = (group: ScenarioGroup, path: string, title: string, value: unknown) => {
    const ordinal = (groupCounts.get(group) ?? 0) + 1;
    groupCounts.set(group, ordinal);
    const count = (pathCounts.get(path) ?? 0) + 1;
    pathCounts.set(path, count);
    const uniquePath = count === 1 ? path : `${path}~${count}`;
    nodes.push({ group, path: uniquePath, title, value, ordinal });
    return uniquePath;
  };
  add('world', 'world', content.world.name, content.world);
  add('brief', 'brief', GROUP_LABELS.brief, content.brief);
  for (const group of [
    'entities',
    'knowledge',
    'clues',
    'conflicts',
    'situations',
    'encounters',
  ] as const) {
    content[group].forEach((item, index) => {
      const title = 'name' in item ? item.name : 'title' in item ? item.title : item.statement;
      const path = add(group, `${group}.${item.key}`, title, item);
      aliases.set(`${group}.${index}`, path);
      if (!aliases.has(`identities.${group}.${item.key}`))
        aliases.set(`identities.${group}.${item.key}`, path);
    });
  }
  content.quests.forEach((quest, index) => {
    const path = add('quests', `quests.${quest.questId}`, quest.title, quest);
    aliases.set(`quests.${index}`, path);
  });
  content.visuals.forEach((visual, index) => {
    const path = add(
      'visuals',
      `visuals.${visual.entity}.${visual.purpose}`,
      content.entities.find((entity) => entity.key === visual.entity)?.name ?? '',
      visual,
    );
    aliases.set(`visuals.${index}`, path);
  });
  add('party', 'party', GROUP_LABELS.party, content.party);
  add('relationships', 'relationships', GROUP_LABELS.relationships, content.relationships);
  add('firstSession', 'firstSession', GROUP_LABELS.firstSession, content.firstSession);
  add('laterOutline', 'laterOutline', GROUP_LABELS.laterOutline, content.laterOutline);
  const nameCounts = new Map<string, number>();
  const nameOrdinals = new Map<string, number>();
  for (const node of nodes) {
    const name = `${node.group}:${node.title}`;
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }
  nodes.forEach((node, index) => {
    const name = `${node.group}:${node.title}`;
    if ((nameCounts.get(name) ?? 0) < 2) return;
    const ordinal = (nameOrdinals.get(name) ?? 0) + 1;
    nameOrdinals.set(name, ordinal);
    nodes[index] = { ...node, title: `${node.title} (${ordinal})` };
  });
  const byPath = new Map(nodes.map((node) => [node.path, node]));
  const valuePaths = new Map(nodes.map((node) => [node.value, node.path]));
  const pathOf = (value: unknown, fallback: string) => valuePaths.get(value) ?? fallback;
  const links = new Map<string, ScenarioLink[]>();
  const connect = (from: string, to: string, label: string, reverse: string) => {
    if (!byPath.has(from) || !byPath.has(to) || from === to) return;
    for (const [source, target, word] of [
      [from, to, label],
      [to, from, reverse],
    ]) {
      if (!source || !target || !word) continue;
      const list = links.get(source) ?? [];
      if (!list.some((link) => link.target === target && link.label === word))
        list.push({ target, label: word });
      links.set(source, list);
    }
  };
  const entity = (key: string) => `entities.${key}`;
  if (content.world.startLocation)
    connect('world', entity(content.world.startLocation), 'Starting place', 'Opening');
  content.entities.forEach((item) => {
    const path = pathOf(item, entity(item.key));
    if (item.location?.parent) connect(path, entity(item.location.parent), 'Within', 'Contains');
    if (item.placement)
      connect(path, entity(item.placement.location), 'Located at', 'Present here');
    const target = item.sheet?.concentration?.targetId;
    if (target) connect(path, entity(target), 'Concentration target', 'Targeted by');
  });
  content.party.forEach((key) => {
    connect('party', entity(key), 'Prepared character', 'Prepared party');
  });
  content.relationships.forEach((item) => {
    connect('relationships', entity(item.npc), 'Initial attitude', 'Initial attitudes');
  });
  content.knowledge.forEach((item) => {
    const path = pathOf(item, `knowledge.${item.key}`);
    if ('holder' in item.scope)
      connect(path, entity(item.scope.holder), 'Knowledge holder', 'Knowledge held');
    if (item.scope.kind === 'WORLD_TRUTH') connect(path, 'world', 'World truth', 'World truth');
    item.subjects.forEach((key) => {
      connect(path, entity(key), 'About', 'Knowledge about this');
    });
    if (item.attributedTo)
      connect(path, entity(item.attributedTo), 'Attributed to', 'Statements attributed here');
    item.relations.forEach((relation) => {
      connect(path, `knowledge.${relation.knowledge}`, relation.type, 'Related knowledge');
    });
  });
  content.clues.forEach((item) => {
    const path = pathOf(item, `clues.${item.key}`);
    connect(path, entity(item.entity), 'Available at', 'Clues available here');
    item.subjects.forEach((key) => {
      connect(path, entity(key), 'About', 'Clues about this');
    });
    // Shared subjects are a navigation aid, never a claim that a clue proves a statement.
    content.knowledge
      .filter((record) => record.subjects.some((key) => item.subjects.includes(key)))
      .forEach((record) => {
        connect(
          path,
          pathOf(record, `knowledge.${record.key}`),
          'Knowledge on the same subject',
          'Clues on the same subject',
        );
      });
  });
  content.conflicts.forEach((item) => {
    item.actors.forEach((key) => {
      connect(pathOf(item, `conflicts.${item.key}`), entity(key), 'Actor', 'Involved in conflict');
    });
  });
  content.situations.forEach((item) => {
    const path = pathOf(item, `situations.${item.key}`);
    connect(path, entity(item.location), 'Location', 'Situations here');
    if (item.location === content.world.startLocation)
      connect('world', path, 'Opening situation', 'Opening');
    item.participants.forEach((key) => {
      connect(path, entity(key), 'Participant', 'Participates in');
    });
    item.clueKeys.forEach((key) => {
      connect(path, `clues.${key}`, 'Available clue', 'Appears in situation');
    });
  });
  content.encounters.forEach((item) => {
    const path = pathOf(item, `encounters.${item.key}`);
    connect(path, entity(item.location), 'Location', 'Encounters here');
    item.combatants.forEach((combatant) => {
      connect(path, entity(combatant.entity), 'Combatant', 'Prepared encounter');
    });
  });
  content.quests.forEach((quest) => {
    const path = pathOf(quest, `quests.${quest.questId}`);
    connect(path, entity(quest.activation.subject), 'Activation subject', 'Related quest');
    quest.milestones.forEach((milestone) => {
      if ('locationId' in milestone)
        connect(path, entity(milestone.locationId), 'Milestone location', 'Quest milestone');
      if ('subject' in milestone)
        connect(path, entity(milestone.subject), 'Milestone subject', 'Quest milestone');
      if ('informant' in milestone)
        connect(path, entity(milestone.informant), 'Informant', 'Quest milestone');
    });
  });
  content.visuals.forEach((visual) => {
    connect(
      pathOf(visual, `visuals.${visual.entity}.${visual.purpose}`),
      entity(visual.entity),
      'Depicts',
      'Visual brief',
    );
  });
  return { nodes, byPath, links, aliases };
}

/** Compiler paths can point into a field, an indexed array, a party seat or identity. */
export function nearestScenarioPath(index: ScenarioIndex, raw: string | null): string {
  if (!raw) return 'world';
  let path = raw.replace(/^content\./, '').replace(/\[(\d+)\]/g, '.$1');
  if (path.startsWith('party.')) {
    const key = path.split('.')[1];
    if (key && index.byPath.has(`entities.${key}`)) return `entities.${key}`;
  }
  for (const [alias, target] of index.aliases) {
    if (path === alias || path.startsWith(`${alias}.`)) {
      path = target + path.slice(alias.length);
      break;
    }
  }
  while (path) {
    if (index.byPath.has(path)) return path;
    const end = path.lastIndexOf('.');
    if (end < 0) break;
    path = path.slice(0, end);
  }
  return 'world';
}
