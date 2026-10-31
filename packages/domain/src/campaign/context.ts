import type {
  CampaignEntity,
  CampaignFinding,
  CampaignIdentities,
  CampaignKnowledge,
  CampaignPackage,
  KernelCommand,
  QuestDefinition,
} from '@ltw/contracts';

export interface CampaignPlan {
  readonly commands: readonly KernelCommand[];
  readonly commandPaths: readonly string[];
  readonly findings: readonly CampaignFinding[];
  readonly quests: readonly QuestDefinition[];
  readonly incomplete: boolean;
}

export interface PlanContext {
  readonly content: CampaignPackage;
  readonly ids: CampaignIdentities;
  readonly entities: Map<string, CampaignEntity>;
  readonly knowledge: Map<string, CampaignKnowledge>;
  readonly findings: CampaignFinding[];
  incomplete: boolean;
}

/** Locale-independent ordering is part of reproducible compilation. */
export const compareKey = (a: string, b: string): number => (a === b ? 0 : a < b ? -1 : 1);

export const error = (context: PlanContext, code: string, path: string, message: string): void => {
  context.findings.push({ severity: 'error', code, path, message });
};
export const missing = (
  context: PlanContext,
  code: string,
  path: string,
  message: string,
): void => {
  context.incomplete = true;
  context.findings.push({ severity: 'warning', code, path, message });
};

/** References stay local until validation succeeds; no label is treated as identity. */
export function entityReference(
  context: PlanContext,
  key: string,
  path: string,
  kinds?: readonly CampaignEntity['kind'][],
): CampaignEntity | undefined {
  const entity = context.entities.get(key);
  if (!entity) error(context, 'REFERENCE_MISSING', path, `Entity reference ${key} does not exist`);
  else if (kinds && !kinds.includes(entity.kind))
    error(context, 'REFERENCE_KIND', path, `Entity reference ${key} has the wrong kind`);
  return entity;
}

/** Own-property lookup also handles a valid local key named "constructor" safely. */
export function identity(map: Readonly<Record<string, string>>, key: string): string {
  return Object.hasOwn(map, key) ? (map[key] ?? '') : '';
}

export function uniqueKeys(
  context: PlanContext,
  values: readonly { readonly key: string }[],
  path: string,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value.key))
      error(
        context,
        'DUPLICATE_KEY',
        `${path}.${value.key}`,
        'Keys must be unique within this collection',
      );
    seen.add(value.key);
  }
}

/** Stable topological order, so author/provider array ordering is not an execution dependency. */
export function topological<T extends { readonly key: string }>(
  context: PlanContext,
  values: readonly T[],
  dependencies: (value: T) => readonly string[],
  path: string,
): T[] {
  const byKey = new Map(values.map((value) => [value.key, value]));
  const visiting = new Set<string>();
  const done = new Set<string>();
  const result: T[] = [];
  const visit = (value: T): void => {
    if (done.has(value.key)) return;
    if (visiting.has(value.key)) {
      error(context, 'REFERENCE_CYCLE', `${path}.${value.key}`, 'References contain a cycle');
      return;
    }
    visiting.add(value.key);
    for (const key of [...dependencies(value)].sort()) {
      const target = byKey.get(key);
      if (target) visit(target);
    }
    visiting.delete(value.key);
    done.add(value.key);
    result.push(value);
  };
  for (const value of [...values].sort((a, b) => compareKey(a.key, b.key))) visit(value);
  return result;
}
