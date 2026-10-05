import {
  DEFAULT_LANGUAGE,
  chronicleOutputSchema,
  type AiTraceView,
  type ChronicleParagraph,
  type ChronicleProse,
  type ChronicleTraceView,
  type Language,
} from '@ltw/contracts';
import {
  checkProse,
  languageOf,
  templateProse,
  type Actor,
  type ChronicleEntry,
  type WorldState,
} from '@ltw/domain';

import {
  CHRONICLE_OUTPUT,
  CHRONICLE_SYSTEM,
  chroniclePrompt,
  renderChroniclePrompt,
} from './chronicle-prompt.ts';
import { runWithFallback, type OutputCheck } from './fallback.ts';
import type { IntentDeps } from './intent.ts';

/**
 * Chronicle rendering (docs/adr/0024-chronicle.md §3; owner decision of
 * 2026-10-04). A `narrative` provider writes the chapter's prose from its
 * deterministic entries only, under the owner's fallback policy. Valid prose
 * cites only the chapter's entries, labels every account or guess as one,
 * and holds no ID; anything else falls back to the deterministic template.
 * Traced; the prose is never read by the World Engine.
 */
export const TEMPLATE_MODEL = 'chronicle-template-1';
const CAPABILITY = 'narrative';
const MAX_ISSUES = 20;

export interface ChronicleInput {
  readonly campaignId: string;
  readonly actor: Actor;
  readonly state: WorldState;
  /** The perspective label the chapter is told from. */
  readonly perspective: string;
  readonly title: string;
  readonly entries: readonly ChronicleEntry[];
}

export interface RenderedChronicle {
  readonly prose: ChronicleProse;
  readonly status: ChronicleTraceView['status'];
  readonly traceId: string;
}

export function validateChronicle(
  output: unknown,
  entries: readonly ChronicleEntry[],
  language: Language = DEFAULT_LANGUAGE,
): OutputCheck<ChronicleParagraph[]> {
  const parsed = chronicleOutputSchema.safeParse(output);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues
        .slice(0, MAX_ISSUES)
        .map((issue) => `${issue.path.join('.') || '(output)'}: ${issue.message}`),
    };
  }
  const issues = checkProse(entries, parsed.data.paragraphs, language);
  return issues.length > 0
    ? { ok: false, issues: issues.slice(0, MAX_ISSUES) }
    : { ok: true, value: parsed.data.paragraphs };
}

export async function renderChronicle(
  deps: IntentDeps,
  input: ChronicleInput,
): Promise<RenderedChronicle> {
  const language = languageOf(input.state);
  const template = templateProse(input.entries, language);
  const prompt = chroniclePrompt(input.state, input.title, input.entries, template);
  const result = await runWithFallback({
    providers: deps.router.providersFor(CAPABILITY),
    build: (repair) => ({
      capability: CAPABILITY,
      system: CHRONICLE_SYSTEM,
      prompt: renderChroniclePrompt(prompt, repair),
      output: CHRONICLE_OUTPUT,
      task: { kind: 'chronicle', prompt, repair },
    }),
    validate: (output) => validateChronicle(output, input.entries, language),
    nowMs: deps.clock.nowMs,
  });
  const traceId = deps.ids.next();
  const status: ChronicleTraceView['status'] =
    result.status === 'VALID' ? 'RENDERED' : result.status;
  const written = result.status === 'VALID' ? result.attempts.at(-1) : undefined;
  const prose: ChronicleProse =
    result.status === 'VALID'
      ? {
          paragraphs: result.value,
          provider: written?.provider ?? 'unknown',
          model: written?.model ?? 'unknown',
          traceId,
        }
      : { paragraphs: template, provider: 'template', model: TEMPLATE_MODEL, traceId };
  const trace: AiTraceView = {
    traceId,
    campaignId: input.campaignId,
    actorId: input.actor.actorId,
    purpose: 'chronicle',
    capability: CAPABILITY,
    scope: input.perspective,
    sourceIds: input.entries.map((entry) =>
      entry.source.kind === 'memory'
        ? entry.source.memoryId
        : `${entry.source.commandId}#${String(entry.source.index)}`,
    ),
    input: input.title,
    attempts: result.attempts,
    status,
    title: input.title,
    entries: input.entries.map((entry) => ({
      key: entry.key,
      source:
        entry.source.kind === 'memory'
          ? `memory:${entry.source.memoryId}`
          : `event:${entry.source.commandId}#${String(entry.source.index)}`,
    })),
    paragraphs: result.status === 'VALID' ? result.value : null,
    issues: result.status === 'INVALID_OUTPUT' ? [...result.issues] : [],
    canonicalEvents: [],
    createdAt: deps.clock.now(),
  };
  await deps.traces.append(trace);
  return { prose, status, traceId };
}
