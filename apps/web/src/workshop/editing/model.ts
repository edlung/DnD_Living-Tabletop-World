import { campaignPackageSchema, type CampaignPackage } from '@ltw/contracts';
import { z } from 'zod';

/** Public JSON Schema from the content contract; no Zod implementation internals. */
export interface FormSchema {
  readonly type?: string | readonly string[];
  readonly properties?: Readonly<Record<string, FormSchema>>;
  readonly required?: readonly string[];
  readonly items?: FormSchema;
  readonly anyOf?: readonly FormSchema[];
  readonly oneOf?: readonly FormSchema[];
  readonly enum?: readonly (string | number | boolean | null)[];
  readonly const?: string | number | boolean | null;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minItems?: number;
  readonly maxItems?: number;
}
export type FormPath = readonly (string | number)[];
export const packageFormSchema = z.toJSONSchema(campaignPackageSchema, {
  io: 'input',
  reused: 'inline',
}) as FormSchema;
export const IDENTITY_FIELDS = new Set(['key', 'questId', 'stage', 'schemaVersion']);

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function valueAt(value: unknown, path: FormPath): unknown {
  let current = value;
  for (const part of path) {
    if (Array.isArray(current) && typeof part === 'number') current = current[part];
    else if (isRecord(current) && typeof part === 'string') current = current[part];
    else return undefined;
  }
  return current;
}

/** Copies only changed ancestors. Undefined removes an optional property. */
export function changeAt(value: unknown, path: FormPath, next: unknown): unknown {
  if (!path.length) return next;
  const [part, ...rest] = path;
  if (typeof part === 'number' && Array.isArray(value)) {
    const rows: unknown[] = value;
    return rows.map((item, index) => (index === part ? changeAt(item, rest, next) : item));
  }
  if (typeof part === 'string' && isRecord(value)) {
    const changed = changeAt(value[part], rest, next);
    return changed === undefined
      ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== part))
      : { ...value, [part]: changed };
  }
  return value;
}

export function schemaBranches(schema: FormSchema): readonly FormSchema[] {
  const union = schema.anyOf ?? schema.oneOf;
  if (union) return union.flatMap(schemaBranches);
  if (schema.type !== undefined && typeof schema.type !== 'string')
    return schema.type.map((type) => ({
      ...schema,
      type,
      ...(schema.enum
        ? {
            enum: schema.enum.filter((value) =>
              type === 'null'
                ? value === null
                : typeof value === (type === 'integer' ? 'number' : type),
            ),
          }
        : {}),
    }));
  return [schema];
}
export function matchingBranch(schema: FormSchema, value: unknown): number {
  const branches = schemaBranches(schema);
  const matches = (branch: FormSchema) => {
    if ('const' in branch) return branch.const === value;
    if (branch.type === 'null') return value === null;
    if (branch.type === 'object' && isRecord(value))
      return Object.entries(branch.properties ?? {}).every(
        ([key, entry]) => !('const' in entry) || entry.const === value[key],
      );
    if (branch.type === 'array') return Array.isArray(value);
    if (branch.type === 'number' || branch.type === 'integer') return typeof value === 'number';
    return branch.type === typeof value;
  };
  const found = branches.findIndex(matches);
  return found < 0 ? 0 : found;
}

/** Shape defaults only. The normal compiler assesses references and mechanics after save. */
export function initialValue(schema: FormSchema, title: string, field = ''): unknown {
  if ('const' in schema) return schema.const;
  const branches = schemaBranches(schema);
  if (branches.length === 1 && branches[0] !== schema)
    return initialValue(branches[0] ?? {}, title, field);
  if (branches.length > 1)
    return initialValue(
      branches.find((entry) => entry.type === 'null') ?? branches[0] ?? {},
      title,
      field,
    );
  if (schema.enum) return schema.enum[0];
  if (IDENTITY_FIELDS.has(field))
    return `draft-${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`;
  if (schema.type === 'object')
    return Object.fromEntries(
      (schema.required ?? []).map((key) => [
        key,
        initialValue(schema.properties?.[key] ?? {}, title, key),
      ]),
    );
  if (schema.type === 'array')
    return Array.from({ length: schema.minItems ?? 0 }, () =>
      initialValue(schema.items ?? {}, title, field),
    );
  if (schema.type === 'boolean') return false;
  if (schema.type === 'number' || schema.type === 'integer')
    return Math.max(schema.minimum ?? 0, 0);
  if (schema.type === 'null') return null;
  return schema.minLength ? title.slice(0, schema.maxLength) : '';
}

/** Switching a tagged shape must retain the identity of an existing authored object. */
export function variantValue(
  branch: FormSchema,
  title: string,
  field: string,
  previous: unknown,
): unknown {
  const next = initialValue(branch, title, field);
  if (!isRecord(previous) || !isRecord(next)) return next;
  for (const key of IDENTITY_FIELDS)
    if (Object.hasOwn(previous, key) && branch.properties?.[key]) next[key] = previous[key];
  return next;
}

export interface ReferenceOption {
  readonly value: string;
  readonly label: string;
}
export function referenceOptions(
  content: CampaignPackage,
  field: string,
  path: FormPath,
): readonly ReferenceOption[] | null {
  if (field === 'knowledge')
    return content.knowledge.map((entry) => ({ value: entry.key, label: entry.statement }));
  if (field === 'clueKeys')
    return content.clues.map((entry) => ({ value: entry.key, label: entry.statement }));
  if (field === 'after') {
    const questIndex = path[0] === 'quests' && typeof path[1] === 'number' ? path[1] : -1;
    return (
      content.quests[questIndex]?.milestones.map((entry) => ({
        value: entry.stage,
        label: entry.summary,
      })) ?? []
    );
  }
  const reference = new Set([
    'startLocation',
    'parent',
    'location',
    'targetId',
    'holder',
    'subjects',
    'attributedTo',
    'npc',
    'entity',
    'actors',
    'participants',
    'party',
    'subject',
    'locationId',
    'informant',
  ]);
  if (!reference.has(field)) return null;
  const locations = ['startLocation', 'parent', 'location', 'locationId'].includes(field);
  return content.entities
    .filter((entry) => !locations || entry.kind === 'location')
    .filter((entry) => field !== 'party' || entry.kind === 'character')
    .map((entry) => ({ value: entry.key, label: entry.name }));
}

export function rowTitle(value: unknown): string | null {
  if (!isRecord(value)) return typeof value === 'string' && value ? value : null;
  for (const field of ['name', 'title', 'summary', 'statement'])
    if (typeof value[field] === 'string' && value[field]) return value[field];
  return null;
}
