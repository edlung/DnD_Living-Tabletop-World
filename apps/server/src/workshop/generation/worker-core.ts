import { randomUUID } from 'node:crypto';

import type { CampaignPackage } from '@ltw/contracts';
import type { OutputCheck } from '@ltw/ai';
import { z } from 'zod';

import type {
  CampaignGenerationDependencies,
  PreparationPayload,
  CampaignPreparationStage,
} from './runtime.ts';
import type {
  GenerationJobScope,
  GenerationLease,
  GenerationMode,
  StoredGenerationJob,
} from './store.ts';

const storedPayloadSchema = z
  .object({
    system: z.string(),
    prompt: z.string(),
    output: z
      .object({
        name: z.string(),
        description: z.string(),
        schema: z.record(z.string(), z.unknown()),
      })
      .strict(),
  })
  .strict();

export interface CampaignWorkerStrategy {
  readonly mode: GenerationMode;
  readonly stages: readonly CampaignPreparationStage[];
  prepare(job: StoredGenerationJob): Promise<
    | {
        payload(stage: CampaignPreparationStage, content: CampaignPackage): PreparationPayload;
        validate(
          stage: CampaignPreparationStage,
          content: CampaignPackage,
          output: unknown,
        ): OutputCheck<CampaignPackage>;
      }
    | { error: string }
  >;
}

/** One job at a time per worker; the durable lease is authoritative across processes. */
export class CampaignPreparationWorker {
  readonly #deps: CampaignGenerationDependencies;
  readonly #workerId = randomUUID();
  readonly #running = new Map<string, { controller: AbortController; done: Promise<void> }>();
  readonly #strategy: CampaignWorkerStrategy;
  constructor(deps: CampaignGenerationDependencies, strategy: CampaignWorkerStrategy) {
    this.#strategy = strategy;
    this.#deps = deps;
  }

  cancel(jobId: string): void {
    this.#running.get(jobId)?.controller.abort();
  }

  async run(scope: GenerationJobScope): Promise<void> {
    if (this.#deps.repository.mode !== this.#strategy.mode || this.#running.has(scope.jobId))
      return;
    const controller = new AbortController();
    const isCancelled = () => controller.signal.aborted;
    let finish: () => void = () => undefined;
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    this.#running.set(scope.jobId, { controller, done });
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let lease: GenerationLease | undefined;
    let dispatching = false;
    try {
      const claimed = await this.#deps.repository.claim(scope, this.#workerId);
      if (claimed.kind !== 'claimed') return;
      if (claimed.job.mode !== this.#strategy.mode) return;
      lease = claimed.lease;
      const currentLease = lease;
      let renewing = false;
      heartbeat = setInterval(() => {
        if (renewing) return;
        renewing = true;
        void this.#deps.repository
          .renew(currentLease)
          .then((result) => {
            if (result.kind === 'fenced') controller.abort();
          })
          .catch(() => {
            controller.abort();
          })
          .finally(() => {
            renewing = false;
          });
      }, 10_000);
      heartbeat.unref();
      if (claimed.job.nextStep >= this.#strategy.stages.length) {
        await this.#deps.repository.finalize(lease);
        return;
      }
      const plan = await this.#strategy.prepare(claimed.job);
      if ('error' in plan) {
        await this.#deps.repository.fail(lease, plan.error);
        return;
      }
      const prepared = await this.#deps.preparation.forJob(lease);
      if (!prepared) {
        await this.#deps.repository.fail(lease, 'PREPARATION_UNAVAILABLE');
        return;
      }
      let content = claimed.job.seed;
      const previous = await this.#deps.repository.steps(scope);
      for (const step of previous) if (step.content) content = step.content;
      for (let ordinal = claimed.job.nextStep; ordinal < this.#strategy.stages.length; ordinal++) {
        const stage = this.#strategy.stages[ordinal];
        if (!stage || isCancelled()) return;
        const persisted = previous.find((step) => step.ordinal === ordinal);
        const payload = persisted ? null : plan.payload(stage, content);
        if (!persisted && Buffer.byteLength(JSON.stringify(payload), 'utf8') > 1048576) {
          await this.#deps.repository.fail(lease, 'PREPARATION_INPUT_TOO_LARGE');
          return;
        }
        const saved = await this.#deps.repository.prepareStep(lease, {
          ordinal,
          input: persisted?.input ?? content,
          prompt: persisted?.prompt ?? JSON.stringify(payload),
          provider: persisted?.provider ?? prepared.provider,
          model: persisted?.model ?? prepared.model,
          traceId: persisted?.traceId ?? randomUUID(),
        });
        if (saved.kind === 'fenced') return;
        if (saved.kind === 'conflict') {
          await this.#deps.repository.fail(lease, 'STEP_CONFLICT');
          return;
        }
        // A template or route change cannot silently modify a prepared durable input.
        if (saved.step.provider !== prepared.provider || saved.step.model !== prepared.model) {
          await this.#deps.repository.fail(lease, 'ROUTE_CHANGED');
          return;
        }
        const exact = storedPayloadSchema.safeParse(JSON.parse(saved.step.prompt));
        if (!exact.success) {
          await this.#deps.repository.fail(lease, 'STORED_INPUT_INVALID');
          return;
        }
        const gate = await this.#deps.repository.beginDispatch(lease, ordinal);
        if (gate.kind === 'fenced' || gate.kind === 'uncertain') return;
        if (gate.kind === 'stored') {
          if (!gate.step.content) throw new Error('GENERATION_RESULT_MISSING');
          content = gate.step.content;
          continue;
        }
        dispatching = true;
        const result = await prepared.run({
          ...(exact.data satisfies PreparationPayload),
          stage,
          traceId: gate.step.traceId,
          signal: controller.signal,
          validate: (output) => plan.validate(stage, gate.step.input, output),
        });
        if (isCancelled()) {
          await this.#deps.repository.fail(
            lease,
            'WORKER_ABORTED',
            result.status === 'DISPATCH_UNKNOWN',
          );
          return;
        }
        if (result.status !== 'GENERATED' || result.value === null) {
          await this.#deps.repository.fail(
            lease,
            result.status,
            result.status === 'DISPATCH_UNKNOWN',
          );
          return;
        }
        if (
          result.traceId !== gate.step.traceId ||
          result.provider !== prepared.provider ||
          result.model !== prepared.model
        ) {
          await this.#deps.repository.fail(lease, 'RESULT_IDENTITY_MISMATCH', true);
          return;
        }
        const stored = await this.#deps.repository.completeStep(lease, ordinal, {
          content: result.value,
          providerRequestId: null,
        });
        dispatching = false;
        if (stored.kind === 'fenced') return;
        if (stored.kind === 'conflict' || !stored.step.content)
          throw new Error('GENERATION_RESULT_CONFLICT');
        content = stored.step.content;
      }
      if (!isCancelled()) await this.#deps.repository.finalize(lease);
    } catch {
      // Storage/provider uncertainty never authorizes another dispatch. Recovery keeps the hold.
      if (lease)
        await this.#deps.repository
          .fail(lease, 'WORKER_UNAVAILABLE', dispatching)
          .catch(() => undefined);
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      this.#running.delete(scope.jobId);
      finish();
    }
  }

  async stop(): Promise<void> {
    const active = [...this.#running.values()];
    for (const { controller } of active) controller.abort();
    await Promise.all(active.map(({ done }) => done));
  }
}
