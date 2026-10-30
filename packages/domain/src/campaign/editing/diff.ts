import {
  CAMPAIGN_EDIT_SECTIONS,
  type CampaignFieldChange,
  type CampaignPackage,
  type CampaignRevision,
} from '@ltw/contracts';

import { campaignEditValueEqual as equal } from './equal.ts';
import { campaignEditRowKey, KEYED_CAMPAIGN_EDIT_SECTIONS } from './keys.ts';
import { campaignEditTargetRecords } from './targets.ts';

const object = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const owns = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

/** Full field comparison: no summary truncation, hidden values, name matching or inferred facts. */
export function diffCampaignPackages(
  before: CampaignRevision,
  after: CampaignPackage,
): readonly CampaignFieldChange[] {
  const changes: CampaignFieldChange[] = [];
  const targets = campaignEditTargetRecords(before);
  const emit = (
    kind: CampaignFieldChange['kind'],
    path: readonly (string | number)[],
    targetId: string,
    left: unknown,
    right: unknown,
  ) => {
    changes.push({
      kind,
      path,
      targetId,
      before: left === undefined ? null : structuredClone(left),
      after: right === undefined ? null : structuredClone(right),
    });
  };
  const walk = (
    left: unknown,
    right: unknown,
    path: readonly (string | number)[],
    targetId: string,
    hasLeft = true,
    hasRight = true,
  ): void => {
    if (!hasLeft) {
      emit('ADDED', path, targetId, undefined, right);
      return;
    }
    if (!hasRight) {
      emit('REMOVED', path, targetId, left, undefined);
      return;
    }
    if (equal(left, right)) return;
    if (object(left) && object(right)) {
      const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
      for (const key of keys)
        walk(left[key], right[key], [...path, key], targetId, owns(left, key), owns(right, key));
      return;
    }
    if (Array.isArray(left) && Array.isArray(right)) {
      const unused = new Set(right.map((_, index) => index));
      const reordered =
        left.length === right.length &&
        left.every((value) => {
          const index = [...unused].find((candidate) => equal(value, right[candidate]));
          if (index === undefined) return false;
          unused.delete(index);
          return true;
        });
      if (reordered) {
        emit('ORDER', path, targetId, left, right);
        return;
      }
      for (let index = 0; index < Math.max(left.length, right.length); index++)
        walk(
          left[index],
          right[index],
          [...path, index],
          targetId,
          index < left.length,
          index < right.length,
        );
      return;
    }
    emit('CHANGED', path, targetId, left, right);
  };
  for (const section of CAMPAIGN_EDIT_SECTIONS) {
    const left = before.content[section],
      right = after[section];
    const targetId = `section:${section}`;
    if (
      !KEYED_CAMPAIGN_EDIT_SECTIONS.has(section) ||
      !Array.isArray(left) ||
      !Array.isArray(right)
    ) {
      walk(left, right, [section], targetId);
      continue;
    }
    const leftKeys = left.map((row) => campaignEditRowKey(section, row)),
      rightKeys = right.map((row) => campaignEditRowKey(section, row));
    if (
      leftKeys.includes(null) ||
      rightKeys.includes(null) ||
      new Set(leftKeys).size !== left.length ||
      new Set(rightKeys).size !== right.length
    ) {
      walk(left, right, [section], targetId);
      continue;
    }
    if (!equal(leftKeys, rightKeys)) emit('ORDER', [section], targetId, leftKeys, rightKeys);
    const leftRows = new Map(left.map((row) => [campaignEditRowKey(section, row), row]));
    const rightRows = new Map(right.map((row) => [campaignEditRowKey(section, row), row]));
    for (const key of [...new Set([...leftKeys, ...rightKeys])]) {
      if (key === null) continue;
      const matches = targets.filter((target) => target.section === section && target.key === key);
      const rowTargetId = matches.length === 1 ? (matches[0]?.targetId ?? targetId) : targetId;
      walk(
        leftRows.get(key),
        rightRows.get(key),
        [section, key],
        rowTargetId,
        leftRows.has(key),
        rightRows.has(key),
      );
    }
  }
  return changes;
}
