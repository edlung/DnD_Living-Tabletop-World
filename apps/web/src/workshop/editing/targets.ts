import type { ScenarioNode } from '../scenario/graph.ts';
import { isRecord, valueAt, type FormPath } from './model.ts';
import type { EditingContext } from './schemas.ts';

function objectKey(section: string, value: unknown): string | null {
  if (!isRecord(value)) return null;
  if (
    section === 'visuals' &&
    typeof value['entity'] === 'string' &&
    typeof value['purpose'] === 'string'
  )
    return `${value['entity']}:${value['purpose']}`;
  const field = section === 'relationships' ? 'npc' : section === 'quests' ? 'questId' : 'key';
  return typeof value[field] === 'string' ? value[field] : null;
}
export function targetForNode(context: EditingContext, node: ScenarioNode) {
  const key = objectKey(node.group, node.value);
  return context.targets.find((target) => target.section === node.group && target.key === key);
}
export function contentPathLocked(
  context: EditingContext,
  content: unknown,
  path: FormPath,
): boolean {
  const section = path[0];
  if (typeof section !== 'string') return false;
  const sectionTarget = context.targets.find(
    (target) => target.section === section && target.key === null,
  );
  const locked = (id: string | undefined) =>
    id !== undefined &&
    context.locks.entries.some(
      (entry) => entry.target.kind === 'content' && entry.target.targetId === id,
    );
  if (locked(sectionTarget?.targetId)) return true;
  const key =
    typeof path[1] === 'number' ? objectKey(section, valueAt(content, path.slice(0, 2))) : null;
  return (
    key !== null &&
    locked(
      context.targets.find((target) => target.section === section && target.key === key)?.targetId,
    )
  );
}
