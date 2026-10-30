import { readableLabel, type Translate } from '@ltw/ui';

import { FIELD_LABELS } from '../scenario/fields.ts';
import { GROUP_LABELS, type ScenarioGroup } from '../scenario/graph.ts';

export const fieldWords = (t: Translate, field: string): string =>
  FIELD_LABELS[field]
    ? t(FIELD_LABELS[field])
    : field in GROUP_LABELS
      ? t(GROUP_LABELS[field as ScenarioGroup])
      : readableLabel(field, t);
const DEPENDENCY_REASONS = new Set([
  'Selected by owner',
  'Collection member',
  'Location parent',
  'Initial placement',
  'Concentration target',
  'Knowledge holder',
  'Knowledge subject',
  'Attributed speaker',
  'Declared knowledge relation',
  'NPC relationship',
  'Clue source',
  'Clue subject',
  'Conflict participant',
  'Situation location',
  'Situation participant',
  'Situation clue',
  'Encounter location',
  'Prepared combatant',
  'Visual subject',
  'Battle map geometry',
  'Quest activation',
  'Quest location',
  'Quest subject',
  'Quest informant',
  'Prepared party member',
  'Starting location',
]);
export const dependencyWords = (t: Translate, reason: string) =>
  DEPENDENCY_REASONS.has(reason) ? t(reason) : t('Structural dependency');
