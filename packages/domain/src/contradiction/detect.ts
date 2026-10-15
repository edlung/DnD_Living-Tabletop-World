import type { KnowledgeScope, KnowledgeType } from '@ltw/contracts';

import type { KernelEvent } from '../kernel/events.ts';
import type { WorldState } from '../kernel/state.ts';
import { contradictionText, languageOf } from '../language/index.ts';
import { scopeKey } from '../knowledge/records.ts';
import { jointScope } from './joint-scope.ts';
import { conflicts, pairKey, type Claim } from './records.ts';

/**
 * Deterministic contradiction detection
 * (docs/adr/0014-contradictions-and-epistemic-integrity.md §2–3). Runs on
 * the events of an accepted decision: every claim the decision sets on a
 * record is compared with every claimed record (existing or new). A
 * conflict is recorded once per pair in the joint holder scope as a neutral
 * CONTRADICTION record plus a DM-only `ContradictionDetected` event. Nothing
 * else changes: no record's type, statement, or relations; no verdict.
 */
interface RecordLike {
  readonly scope: KnowledgeScope;
  readonly knowledgeType: KnowledgeType;
  readonly attributedTo: string | null;
}

export function withContradictions(
  state: WorldState,
  events: readonly KernelEvent[],
  commandId: string,
): KernelEvent[] {
  const added = events.flatMap((event) =>
    event.type === 'ClaimSet' && event.payload.target.kind === 'knowledge'
      ? [{ knowledgeId: event.payload.target.knowledgeId, claim: event.payload.claim }]
      : [],
  );
  if (added.length === 0) return [...events];

  const records = new Map<string, RecordLike>(state.knowledge);
  const used = new Set(state.usedIds);
  for (const event of events) {
    if (event.type === 'KnowledgeAssigned') {
      records.set(event.payload.knowledgeId, event.payload);
      used.add(event.payload.knowledgeId);
    }
    if (event.type === 'MemoryRecorded') used.add(event.payload.memoryId);
  }
  const claims = new Map<string, Claim>(state.epistemics.claims);
  added.forEach(({ knowledgeId, claim }) => claims.set(knowledgeId, claim));
  const recorded = new Set(state.epistemics.contradictions.keys());

  const detected: KernelEvent[] = [];
  for (const { knowledgeId, claim } of added) {
    const record = records.get(knowledgeId);
    if (!record) throw new Error(`claim on unknown record ${knowledgeId}`);
    for (const [otherId, otherClaim] of claims) {
      if (otherId === knowledgeId || !conflicts(claim, otherClaim)) continue;
      const other = records.get(otherId);
      if (!other) throw new Error(`claim on unknown record ${otherId}`);
      const scope = jointScope(state, record.scope, other.scope);
      if (scope === null) continue;
      const key = pairKey(scopeKey(scope), knowledgeId, otherId);
      if (recorded.has(key)) continue;
      recorded.add(key);

      const contradictionId = derivedId(`${commandId}|${key}`, used);
      used.add(contradictionId);
      const [a, b] = knowledgeId < otherId ? [knowledgeId, otherId] : [otherId, knowledgeId];
      const [first, second] = [records.get(a), records.get(b)];
      if (!first || !second) throw new Error('unreachable: conflicting records exist');
      detected.push(
        {
          type: 'KnowledgeAssigned',
          payload: {
            knowledgeId: contradictionId,
            scope,
            knowledgeType: 'CONTRADICTION',
            statement: neutralStatement(state, claim.subjectId, first, second),
            subjects: [claim.subjectId],
            attributedTo: null,
            relations: [
              { type: 'CONTRADICTS', knowledgeId: a },
              { type: 'CONTRADICTS', knowledgeId: b },
            ],
            knownSince: state.clock,
          },
        },
        {
          type: 'ContradictionDetected',
          payload: {
            knowledgeId: contradictionId,
            scope,
            subjectId: claim.subjectId,
            aspect: claim.aspect,
            between: [a, b],
            named: namedBy(claim.subjectId, first, second),
          },
        },
      );
    }
  }
  return [...events, ...detected];
}

/** The entities whose names `neutralStatement` quotes, so its footprint reads them. */
function namedBy(subjectId: string, first: RecordLike, second: RecordLike): string[] {
  const speakers = [first.attributedTo, second.attributedTo].filter(
    (speaker): speaker is string => speaker !== null,
  );
  return [...new Set([subjectId, ...speakers])];
}

/**
 * Symmetric wording that names only what every holder of the scope already
 * sees: the subject (a subject of both records) and who said each account.
 * No statement is quoted and no aspect or value is named.
 */
function neutralStatement(
  state: WorldState,
  subjectId: string,
  first: RecordLike,
  second: RecordLike,
): string {
  const words = contradictionText(languageOf(state));
  const subject = state.entities.get(subjectId)?.name ?? words.something;
  const label = (record: RecordLike) =>
    record.attributedTo !== null
      ? (state.entities.get(record.attributedTo)?.name ?? words.someone)
      : words.anonymous(record.knowledgeType);
  const [a, b] = [label(first), label(second)];
  return a === b ? words.sameHolder(subject, a) : words.twoHolders(subject, a, b);
}

/**
 * `ctr-` + FNV-1a 64 of the causing command and pair key: deterministic and
 * independent of other history, so re-deciding the same command yields the
 * same ID; suffixed only if ever taken.
 */
function derivedId(key: string, used: ReadonlySet<string>): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= BigInt(key.charCodeAt(index));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  const base = `ctr-${hash.toString(16).padStart(16, '0')}`;
  let candidate = base;
  for (let suffix = 2; used.has(candidate); suffix += 1) candidate = `${base}-${String(suffix)}`;
  return candidate;
}
