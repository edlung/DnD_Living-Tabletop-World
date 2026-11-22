import type { CampaignPackage } from '../../packages/contracts/src/index.ts';

/** The inventory already lists the carrier's starting possessions. Give each hero the factual
 * knowledge needed to read the approved presentation of their own equipment as well. */
export function withStartingGear(content: CampaignPackage): CampaignPackage {
  const privateFacts: CampaignPackage['knowledge'][number][] = [];
  for (const hero of content.party) {
    const visible = new Set(
      content.knowledge
        .filter(
          ({ scope }) =>
            scope.kind === 'PUBLIC' ||
            scope.kind === 'PARTY' ||
            (scope.kind === 'CHARACTER' && scope.holder === hero),
        )
        .flatMap((row) => row.subjects),
    );
    const items = (content.possessions ?? [])
      .filter((p) => p.holder === hero && !visible.has(p.item))
      .map((p) => p.item);
    if (!items.length) continue;
    const key = 'starting-gear-' + hero;
    if (content.knowledge.some((row) => row.key === key))
      throw new Error('Starting inventory key already in use: ' + hero);
    privateFacts.push({
      key,
      scope: { kind: 'CHARACTER', holder: hero },
      knowledgeType: 'FACT',
      statement:
        'Перед дорогой вы проверили вещи, выданные вам на старте. Они перечислены в вашем снаряжении.',
      subjects: items,
      knownSince: null,
      relations: [],
    });
  }
  return privateFacts.length
    ? { ...content, knowledge: [...content.knowledge, ...privateFacts] }
    : content;
}
