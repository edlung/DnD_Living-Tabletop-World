import type { Capability, CapabilityResult, Row } from './eval-rows.ts';
import type { RunCharges, UsageSample } from './session-estimate.ts';

/**
 * The evaluation report (docs/STAGE_300_REMEDIATION_DESIGN.md §4; ADR 0032, checkpoint C). For
 * each capability it keeps four questions in separate columns and totals: semantic correctness
 * (oracles), safe decline (intents), technical provider success (the configured remote provider
 * produced the accepted result) and quality (never judged here). Lexical checks and the
 * context-isolation check of the provider input are reported apart. End-to-end request latency
 * (admission, attempts, repair, fallback, persistence wait) is reported apart from the latency
 * of individual attempts.
 */
const percentile = (values: readonly number[], q: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? null;
};
const ms = (value: number | null) => (value === null ? 'n/a' : `${String(value)} ms`);

export interface CapabilitySummary {
  readonly cases: number;
  readonly semanticPass: number;
  readonly semanticFail: number;
  readonly semanticNotJudged: number;
  readonly safeDeclines: number;
  readonly remoteValid: number;
  readonly lexicalLeakRows: number;
  readonly isolationLeakRows: number;
  readonly isolationInspected: number;
  readonly isolationMissingRows: number;
  readonly sourcesChecked: number;
  readonly sourcesMismatched: number;
  readonly endToEnd: { readonly p50: number | null; readonly p95: number | null };
  readonly attempt: { readonly p50: number | null; readonly p95: number | null };
}

export function summarize(result: CapabilityResult): CapabilitySummary {
  const rows = result.rows;
  const e2e = rows.map((row) => row.endToEndMs);
  const attempts = rows.flatMap((row) => row.technical.attempts.map((a) => a.latencyMs));
  return {
    cases: rows.length,
    semanticPass: rows.filter((row) => row.semantic.pass === true).length,
    semanticFail: rows.filter((row) => row.semantic.pass === false).length,
    semanticNotJudged: rows.filter((row) => row.semantic.pass === null).length,
    safeDeclines: rows.filter((row) => row.semantic.outcome === 'safe-decline').length,
    remoteValid: rows.filter((row) => row.technical.remoteValid).length,
    lexicalLeakRows: rows.filter((row) => (row.lexicalLeaks ?? []).length > 0).length,
    isolationLeakRows: rows.filter((row) => (row.isolation?.leaks ?? []).length > 0).length,
    isolationInspected: rows.filter((row) => row.isolation?.inspected === true).length,
    isolationMissingRows: rows.filter((row) => (row.isolation?.missing ?? []).length > 0).length,
    sourcesChecked: rows.filter((row) => typeof row.isolation?.sourcesMatch === 'boolean').length,
    sourcesMismatched: rows.filter((row) => row.isolation?.sourcesMatch === false).length,
    endToEnd: { p50: percentile(e2e, 0.5), p95: percentile(e2e, 0.95) },
    attempt: { p50: percentile(attempts, 0.5), p95: percentile(attempts, 0.95) },
  };
}

/** The run's own accounting over all rows. */
export function runCharges(results: Partial<Record<Capability, CapabilityResult>>): RunCharges {
  const rows = Object.values(results).flatMap((result) => result.rows);
  return {
    knownMicros: rows.reduce((sum, row) => sum + row.accounting.knownMicros, 0n),
    heldMicros: rows.reduce((sum, row) => sum + row.accounting.heldMicros, 0n),
    openAttempts: rows.reduce((sum, row) => sum + row.accounting.openAttempts, 0),
    remoteAttempts: rows.reduce((sum, row) => sum + row.accounting.remoteAttempts, 0),
  };
}

/**
 * One measured sample per request with a known charge (its dispatched attempts' terminal charges,
 * every billed usage class at the verified rates), per capability. Requests never dispatched, or
 * with a held attempt of unknown charge, give none: token counts alone never price a sample.
 */
export function usageSamples(
  results: Partial<Record<Capability, CapabilityResult>>,
): Partial<Record<Capability, UsageSample[]>> {
  const samples: Partial<Record<Capability, UsageSample[]>> = {};
  for (const [capability, result] of Object.entries(results) as [Capability, CapabilityResult][]) {
    for (const row of result.rows) {
      const charge = row.accounting.measuredMicros;
      if (charge !== null) (samples[capability] ??= []).push({ chargeMicros: charge });
    }
  }
  return samples;
}

/** Chronicle: chapters by authorship (only model prose is judged) and rejected model answers. */
function chronicleLines(rows: readonly Row[]): string[] {
  const chapters = rows.flatMap((row) => (row.chronicle === undefined ? [] : [row.chronicle]));
  if (chapters.length === 0) return [];
  const by = (authorship: string) =>
    String(chapters.filter((chapter) => chapter.authorship === authorship).length);
  const causes = new Map<string, number>();
  for (const cause of chapters.flatMap((c) => c.rejections.flatMap((r) => r.causes))) {
    causes.set(cause, (causes.get(cause) ?? 0) + 1);
  }
  const rejected = chapters.reduce((n, chapter) => n + chapter.rejections.length, 0);
  return [
    `- Chapters by authorship: model ${by('model')}, model rejected (template committed) ${by('model-rejected')}, template without model output ${by('template')}, local ${by('local')}; template and local chapters are never a model pass`,
    `- Model answers rejected by validation before commit: ${String(rejected)}${rejected === 0 ? '' : ` (${[...causes].map(([cause, n]) => `${cause} ${String(n)}`).join(', ')})`}`,
  ];
}

const verdictCell = (row: Row) =>
  row.semantic.pass === null ? 'not judged' : row.semantic.pass ? 'PASS' : 'FAIL';

export function capabilityMarkdown(capability: Capability, result: CapabilityResult): string[] {
  const s = summarize(result);
  const rows = result.rows;
  return [
    `## ${capability}`,
    '',
    ...(result.deadlineMs === undefined
      ? []
      : [`Effective relevance deadline (configuration): ${String(result.deadlineMs)} ms.`, '']),
    `- Semantic correctness (oracle): ${String(s.semanticPass)} pass, ${String(s.semanticFail)} fail, ${String(s.semanticNotJudged)} not judged of ${String(s.cases)}`,
    ...(capability === 'reasoning'
      ? [`- Safe declines (deliberate \`NO_PROPOSAL\`): ${String(s.safeDeclines)}`]
      : []),
    `- Technical provider success (remote produced the accepted answer): ${String(s.remoteValid)} of ${String(s.cases)}`,
    ...chronicleLines(rows),
    `- Quality / voice judgment: not assessed here (human or independent review)`,
    ...(rows.some((row) => row.lexicalLeaks !== undefined)
      ? [
          `- Lexical output scan (markers, guarded content): ${String(s.lexicalLeakRows)} row(s) with a match`,
        ]
      : []),
    ...(rows.some((row) => row.isolation !== undefined)
      ? [
          `- Context isolation of provider input: ${String(s.isolationInspected)} request(s) inspected, ${String(s.isolationLeakRows)} with a forbidden item (phrases lexical, IDs exact)`,
        ]
      : []),
    ...(rows.some((row) => row.isolation?.sourcesMatch !== undefined)
      ? [
          `- Sources equal to the context builder's (ID-level): ${String(s.sourcesChecked - s.sourcesMismatched)} of ${String(s.sourcesChecked)} checked; allowed content missing from the input: ${String(s.isolationMissingRows)} request(s)`,
        ]
      : []),
    `- End-to-end latency p50/p95: ${ms(s.endToEnd.p50)} / ${ms(s.endToEnd.p95)}; attempt latency p50/p95: ${ms(s.attempt.p50)} / ${ms(s.attempt.p95)}`,
    '',
    '| case | semantic | technical | providers | e2e | note |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map(
      (row) =>
        `| ${row.case} | ${verdictCell(row)}${row.semantic.reason === null ? '' : ` (${row.semantic.reason})`} | ${row.technical.status} | ${row.technical.attempts.map((a) => `${a.provider}:${a.kind}:${a.outcome}`).join(' → ') || '-'} | ${String(row.endToEndMs)} ms | ${row.note}${(row.lexicalLeaks ?? []).length > 0 ? `; LEXICAL ${(row.lexicalLeaks ?? []).join(',')}` : ''}${(row.isolation?.leaks ?? []).length > 0 ? `; INPUT ${(row.isolation?.leaks ?? []).join(',')}` : ''}${row.isolation?.sourcesMatch === false ? '; SOURCES differ from the builder' : ''}${(row.isolation?.missing ?? []).length > 0 ? `; MISSING ${(row.isolation?.missing ?? []).join(',')}` : ''} |`,
    ),
    '',
  ];
}

export function headerMarkdown(mode: 'offline' | 'live'): string[] {
  return mode === 'offline'
    ? [
        '# Stage 300 — OFFLINE evaluation run (deterministic local providers)',
        '',
        'Not a live measurement: no remote provider was constructed or called. Oracles judge the',
        'local answers only; technical provider success is zero by construction.',
        '',
      ]
    : [
        '# Stage 300 — evaluation run against the configured remote provider',
        '',
        'Charged to the registered evaluation run under its stored approval. Semantic oracles,',
        'lexical scans, input isolation and technical outcomes are separate; quality and NPC voice',
        'are not judged here.',
        '',
      ];
}
