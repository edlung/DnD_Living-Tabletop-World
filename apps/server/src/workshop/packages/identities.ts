import { randomUUID } from 'node:crypto';

import type { CampaignIdentities, CampaignPackage, EntityKind } from '@ltw/contracts';

export type CampaignIdentityNamespace = 'entities' | 'knowledge' | 'clues' | 'encounters' | 'scene';
export interface CampaignIdentityRecord {
  readonly namespace: CampaignIdentityNamespace;
  readonly key: string;
  readonly id: string;
  readonly entityKind: EntityKind | null;
}
export type IdentityAllocation =
  | {
      readonly kind: 'allocated';
      readonly identities: CampaignIdentities;
      readonly added: readonly CampaignIdentityRecord[];
    }
  | { readonly kind: 'conflict' };

/** Retained registry restores deleted aliases; each immutable revision sees current keys only. */
export function allocateCampaignIdentities(
  content: CampaignPackage,
  retained: readonly CampaignIdentityRecord[],
): IdentityAllocation {
  const registry = new Map(retained.map((record) => [`${record.namespace}/${record.key}`, record]));
  const added: CampaignIdentityRecord[] = [];
  const entities: Record<string, string> = {};
  const knowledge: Record<string, string> = {};
  const clues: Record<string, string> = {};
  const encounters: Record<string, string> = {};
  const resolve = (
    namespace: CampaignIdentityNamespace,
    key: string,
    entityKind: EntityKind | null,
  ): string | null => {
    const registryKey = `${namespace}/${key}`;
    const prior = registry.get(registryKey);
    if (prior) return prior.entityKind === entityKind ? prior.id : null;
    const record = { namespace, key, id: randomUUID(), entityKind };
    registry.set(registryKey, record);
    added.push(record);
    return record.id;
  };
  for (const entity of content.entities) {
    const id = resolve('entities', entity.key, entity.kind);
    if (id === null) return { kind: 'conflict' };
    entities[entity.key] = id;
  }
  for (const [namespace, values, result] of [
    ['knowledge', content.knowledge, knowledge],
    ['clues', content.clues, clues],
    ['encounters', content.encounters, encounters],
  ] as const) {
    for (const item of values) {
      const id = resolve(namespace, item.key, null);
      if (id === null) return { kind: 'conflict' };
      result[item.key] = id;
    }
  }
  const scene = resolve('scene', 'initial', null);
  if (scene === null) return { kind: 'conflict' };
  return {
    kind: 'allocated',
    identities: { entities, knowledge, clues, encounters, scene },
    added,
  };
}
