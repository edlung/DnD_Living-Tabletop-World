import type { CampaignEditSection } from '@ltw/contracts';

export const KEYED_CAMPAIGN_EDIT_SECTIONS: ReadonlySet<CampaignEditSection> = new Set([
  'entities',
  'knowledge',
  'relationships',
  'clues',
  'conflicts',
  'situations',
  'encounters',
  'quests',
  'visuals',
]);

export function campaignEditRowKey(section: CampaignEditSection, row: unknown): string | null {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) return null;
  const record = row as Readonly<Record<string, unknown>>;
  if (section === 'visuals')
    return typeof record['entity'] === 'string' && typeof record['purpose'] === 'string'
      ? `${record['entity']}:${record['purpose']}`
      : null;
  const key = section === 'quests' ? 'questId' : section === 'relationships' ? 'npc' : 'key';
  return typeof record[key] === 'string' ? record[key] : null;
}
