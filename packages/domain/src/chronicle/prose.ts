import { CHRONICLE_LIMITS, type ChronicleParagraph } from '@ltw/contracts';

import { HEDGED_TYPES, type StoredEntry } from './records.ts';

/**
 * Prose rules (docs/adr/0024-chronicle.md §3). Prose is told from a
 * chapter's entries and nothing else: every paragraph cites the entries it
 * tells, by key. A paragraph citing an account, a rumor, an inference, a
 * hypothesis, a contradiction, or an unknown must say so in words, so a
 * hypothesis is never told as established history. Prose never carries IDs.
 * The template below always satisfies these rules.
 */
const HEDGE =
  /\b(said|says|told|tells|claim\w*|according|report\w*|suspect\w*|suspicio\w*|believ\w*|thought|think\w*|rumou?r\w*|perhaps|maybe|might|may|seem\w*|wonder\w*|account\w*|disagree\w*|unclear|unknown|uncertain\w*|apparently|suppos\w*|hypothes\w*|guess\w*)\b/i;

/** IDs that must never appear in prose: the structured ones (with `-`, `_`, or digits). */
function idsOf(entries: readonly StoredEntry[]): string[] {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (entry.source.kind === 'memory') ids.add(entry.source.memoryId);
    if (entry.locationId) ids.add(entry.locationId);
    for (const id of entry.participants) ids.add(id);
    for (const { knowledgeId } of entry.knowledge) ids.add(knowledgeId);
  }
  return [...ids].filter((id) => /[-_0-9]/.test(id));
}

export function checkProse(
  entries: readonly StoredEntry[],
  paragraphs: readonly ChronicleParagraph[],
): string[] {
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));
  const ids = idsOf(entries);
  const issues: string[] = [];
  paragraphs.forEach((paragraph, index) => {
    const at = `paragraphs.${String(index)}`;
    for (const key of paragraph.cites) {
      if (!byKey.has(key)) issues.push(`${at}.cites: "${key}" is no entry of this chapter`);
    }
    const hedged = paragraph.cites.some((key) =>
      (byKey.get(key)?.knowledge ?? []).some(({ knowledgeType }) =>
        HEDGED_TYPES.has(knowledgeType),
      ),
    );
    if (hedged && !HEDGE.test(paragraph.text)) {
      issues.push(`${at}.text: tells an account or a guess as fact; say whose or how uncertain`);
    }
    const leaked = ids.find((id) => paragraph.text.includes(id));
    if (leaked !== undefined) issues.push(`${at}.text: contains an ID`);
  });
  return issues;
}

const LABEL: Readonly<Record<string, string>> = {
  TESTIMONY: 'According to that account',
  RUMOR: 'A rumor said',
  INFERENCE: 'It seemed',
  HYPOTHESIS: 'A suspicion, not established',
  CONTRADICTION: 'Accounts disagreed',
  UNKNOWN: 'It remained unknown',
};

const fit = (text: string) =>
  text.length <= CHRONICLE_LIMITS.paragraphChars
    ? text
    : `${text.slice(0, CHRONICLE_LIMITS.paragraphChars - 1)}…`;

/** The deterministic template: one paragraph per entry, each account labelled as one. */
export function templateProse(entries: readonly StoredEntry[]): ChronicleParagraph[] {
  return entries.map((entry) => {
    const accounts = entry.knowledge
      .filter(({ knowledgeType }) => HEDGED_TYPES.has(knowledgeType))
      .map(
        ({ knowledgeType, statement }) => `${LABEL[knowledgeType] ?? 'Reportedly'}: ${statement}`,
      );
    return { text: fit([entry.text, ...accounts].join(' ')), cites: [entry.key] };
  });
}
