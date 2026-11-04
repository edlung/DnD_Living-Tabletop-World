import { srdMonsterBlock } from '@ltw/rules';

/**
 * A creature or person the workshop's generation names by its SRD bestiary ID
 * (docs/adr/0058-campaign-content.md §6): its stat block is the SRD's, written here into the step's
 * raw output before the domain checks it, whatever `statBlock` the model wrote. An ID the bestiary
 * lacks refuses the output, as any malformed step is refused and retried.
 */
export type MonsterResolution =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly issues: readonly string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function withSrdStatBlocks(output: unknown): MonsterResolution {
  const listed = isRecord(output) ? output['entities'] : undefined;
  if (!isRecord(output) || !Array.isArray(listed)) return { ok: true, value: output };
  const issues: string[] = [];
  const entities = listed.map((entity: unknown) => {
    const monster = isRecord(entity) ? entity['monster'] : undefined;
    if (!isRecord(entity) || typeof monster !== 'string') return entity;
    const block = srdMonsterBlock(monster);
    if (!block) {
      issues.push(`UNKNOWN_BESTIARY_MONSTER:${String(entity['key'])}`);
      return entity;
    }
    return { ...entity, statBlock: structuredClone(block.statBlock) };
  });
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: { ...output, entities } };
}
