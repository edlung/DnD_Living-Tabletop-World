import type pg from 'pg';
import { ImageGenerationError, type ImageGenerator, type WorkshopImageSubject } from '@ltw/ai';

import { fixedStep } from '../ai/accounting/deadline.ts';
import { readMonetaryPolicy } from '../ai/accounting/monetary-policy.ts';
import { readCommitted } from '../ai/accounting/pg-transaction.ts';
import { checkContent, contentHashOf } from '../assets/content-store.ts';
import type { AppConfig } from '../platform/config/config.ts';
import type { Logger } from '../platform/logging/logger.ts';
import type { DraftImageRepository } from '../workshop/images/store.ts';
import { readDraftImageClaim } from './draft-admission.ts';
import { draftImageBrief, draftImageInputSchema, resolveDraftImageVisual } from './draft-input.ts';
import type { DraftImageRuntime, DraftImageRunResult } from './draft-runtime-types.ts';
import { PostgresImageLedger } from './ledger.ts';
import { OPENROUTER_OPENAI_PROVIDER } from './models.ts';
import { createOpenRouterImageGenerator, requestBody } from './openrouter-generator.ts';
import { pictureGrantEnabled } from './picture-grants.ts';
import { subjectGroup } from './style.ts';
import type { StyleReferences } from './style-references.ts';

export type {
  DraftImageRuntime,
  DraftImageRunResult,
  PreparedDraftImage,
} from './draft-runtime-types.ts';

export interface DraftImageRuntimeDependencies {
  readonly pool: pg.Pool;
  readonly config: Pick<AppConfig, 'assets'>;
  readonly logger: Logger;
  readonly contents: Pick<DraftImageRepository, 'content'>;
  readonly styleReferences?: StyleReferences;
  readonly fetch?: typeof fetch;
}

/** Uses existing credentials/model and ledger; it never creates a campaign or canonical asset. */
export function createDraftImageRuntime(deps: DraftImageRuntimeDependencies): DraftImageRuntime {
  const route = deps.config.assets.generator;
  let setup: Promise<{ generator: ImageGenerator; styles: StyleReferences }> | undefined;
  const backend = () => {
    if (route.kind !== 'openrouter-openai') return null;
    setup ??= (async () => {
      const styles =
        deps.styleReferences ??
        (await (async () => {
          const { loadCuratedSet } = await import('./curated-set.ts');
          const { loadStyleReferences } = await import('./style-references.ts');
          return loadStyleReferences(await loadCuratedSet());
        })());
      return {
        styles,
        generator: createOpenRouterImageGenerator({
          apiKey: route.apiKey,
          model: route.model,
          ledger: new PostgresImageLedger(deps.pool),
          styleReferences: styles,
          timeoutMs: deps.config.assets.generationTimeoutMs,
          logger: deps.logger,
          ...(deps.fetch ? { fetch: deps.fetch } : {}),
        }),
      };
    })();
    return setup;
  };
  const referenceHashes = (styles: StyleReferences, kind: string, derived: boolean) =>
    derived ? [] : styles[subjectGroup(kind)].slice(0, 2).map(contentHashOf);
  const unavailable = (reason: string) => ({ status: 'UNAVAILABLE' as const, reason });
  return {
    async availability(ownerId) {
      const denied = (reason: 'NO_ROUTE' | 'NO_POLICY' | 'NO_GRANT' | 'UNAVAILABLE') => ({
        available: false,
        provider: null,
        model: null,
        reason,
      });
      if (route.kind !== 'openrouter-openai') return denied('NO_ROUTE');
      try {
        if (!(await backend())) return denied('UNAVAILABLE');
        const reason = await readCommitted(deps.pool, fixedStep(), async (tx) => {
          const owner = await tx.query(
            'SELECT 1 FROM ltw_workshop_owners WHERE owner_id=$1::uuid',
            [ownerId],
          );
          if (owner.rowCount !== 1) return 'UNAVAILABLE';
          if ((await readMonetaryPolicy(tx, { scope: 'images' }))?.mode !== 'UNLIMITED')
            return 'NO_POLICY';
          return (await pictureGrantEnabled(tx, ownerId)) ? 'READY' : 'NO_GRANT';
        });
        return reason === 'READY'
          ? {
              available: true,
              provider: OPENROUTER_OPENAI_PROVIDER,
              model: route.model,
              reason: 'READY',
            }
          : denied(reason);
      } catch {
        return denied('UNAVAILABLE');
      }
    },
    async prepare(source) {
      if (route.kind !== 'openrouter-openai') return unavailable('IMAGE_UNAVAILABLE');
      try {
        const configured = await backend();
        if (!configured) return unavailable('IMAGE_UNAVAILABLE');
        const { revision, entityId, purpose, reference } = source;
        const entities = revision.content.entities.filter(
          (item) => revision.identities.entities[item.key] === entityId,
        );
        const entity = entities[0];
        if (entities.length !== 1 || !entity) return unavailable('IMAGE_SUBJECT_INVALID');
        const visual = resolveDraftImageVisual(revision.content, entity.key, purpose);
        if (!visual) return unavailable('IMAGE_BRIEF_MISSING');
        if (reference && contentHashOf(reference.bytes) !== reference.contentHash)
          return unavailable('IMAGE_REFERENCE_INVALID');
        if (reference) checkContent(reference);
        const parsed = draftImageInputSchema.safeParse({
          schemaVersion: 1,
          subject: { entityId, localKey: entity.key, kind: entity.kind },
          appearance: visual.description,
          style: visual.style,
          note: source.note ?? null,
          purpose,
          variant: purpose === 'image' ? 'reference' : 'derived',
          label: purpose === 'image' ? null : purpose,
          reference: reference
            ? {
                candidateId: reference.candidateId,
                contentHash: reference.contentHash,
                mediaType: reference.mediaType,
              }
            : null,
          stylePolicy: {
            version: 1,
            referenceHashes: referenceHashes(configured.styles, entity.kind, purpose !== 'image'),
          },
        });
        if (!parsed.success) return unavailable('IMAGE_INPUT_INVALID');
        const input = parsed.data;
        const brief = draftImageBrief(input, reference, 'preparation');
        return {
          status: 'PREPARED',
          input,
          provider: OPENROUTER_OPENAI_PROVIDER,
          model: route.model,
          requestDigest: contentHashOf(
            Buffer.from(JSON.stringify(requestBody(brief, route.model, configured.styles)), 'utf8'),
          ),
        };
      } catch {
        return unavailable('IMAGE_UNAVAILABLE');
      }
    },
    async forJob(lease) {
      if (route.kind !== 'openrouter-openai') return null;
      const subject: WorkshopImageSubject = {
        kind: 'workshop',
        ownerId: lease.ownerId,
        draftId: lease.draftId,
        jobId: lease.jobId,
        authSessionId: lease.authSessionId,
        workerId: lease.workerId,
        fence: lease.fence,
      };
      try {
        const binding = await readCommitted(deps.pool, fixedStep(), (tx) =>
          readDraftImageClaim(tx, subject, lease.chargeId, {
            provider: OPENROUTER_OPENAI_PROVIDER,
            model: route.model,
          }),
        );
        const saved = draftImageInputSchema.safeParse(binding?.input);
        if (!binding || !saved.success) return null;
        if (
          saved.data.subject.entityId !== binding.entity_id ||
          saved.data.purpose !== binding.purpose ||
          saved.data.variant !== binding.variant ||
          saved.data.label !== binding.label
        )
          return null;
        const configured = await backend();
        if (!configured) return null;
        return {
          provider: OPENROUTER_OPENAI_PROVIDER,
          model: route.model,
          async run(call) {
            const result = (
              status: DraftImageRunResult['status'],
              failure: DraftImageRunResult['failure'],
              execution: DraftImageRunResult['execution'] = null,
            ): DraftImageRunResult => ({
              status,
              failure,
              execution,
              provider: OPENROUTER_OPENAI_PROVIDER,
              model: route.model,
              bytes: null,
              mediaType: null,
            });
            try {
              const parsed = draftImageInputSchema.safeParse(call.input);
              if (
                !parsed.success ||
                call.chargeId !== lease.chargeId ||
                JSON.stringify(parsed.data) !== JSON.stringify(saved.data)
              )
                return result('UNAVAILABLE', 'UNAVAILABLE');
              const input = parsed.data;
              if (
                JSON.stringify(
                  referenceHashes(
                    configured.styles,
                    input.subject.kind,
                    input.variant === 'derived',
                  ),
                ) !== JSON.stringify(input.stylePolicy.referenceHashes)
              )
                return result('UNAVAILABLE', 'UNAVAILABLE');
              const reference = input.reference
                ? await deps.contents.content(lease, input.reference.contentHash)
                : null;
              if (
                input.reference &&
                (!reference ||
                  reference.mediaType !== input.reference.mediaType ||
                  contentHashOf(reference.bytes) !== input.reference.contentHash)
              )
                return result('UNAVAILABLE', 'UNAVAILABLE');
              const brief = draftImageBrief(input, reference, lease.jobId);
              const digest = contentHashOf(
                Buffer.from(
                  JSON.stringify(requestBody(brief, route.model, configured.styles)),
                  'utf8',
                ),
              );
              if (digest !== binding.request_digest) return result('UNAVAILABLE', 'UNAVAILABLE');
              const image = await configured.generator.generate(brief, call.signal, {
                subject,
                requestId: lease.jobId,
                chargeId: lease.chargeId,
                beforeDispatch: async (proof) =>
                  !call.signal.aborted &&
                  proof.chargeId === lease.chargeId &&
                  proof.requestDigest === binding.request_digest &&
                  (await call.beforeDispatch(proof)),
              });
              if (call.signal.aborted) return result('FAILED', 'TIMEOUT', image.execution ?? null);
              return {
                status: 'GENERATED',
                bytes: image.bytes,
                mediaType: image.mediaType,
                provider: OPENROUTER_OPENAI_PROVIDER,
                model: image.model,
                execution: image.execution ?? null,
                failure: null,
              };
            } catch (error) {
              const failure = error instanceof ImageGenerationError ? error.code : 'UNAVAILABLE';
              const execution =
                error instanceof ImageGenerationError ? (error.execution ?? null) : null;
              return result(
                execution?.outcome === 'dispatch_unknown'
                  ? 'DISPATCH_UNKNOWN'
                  : failure === 'UNAVAILABLE'
                    ? 'UNAVAILABLE'
                    : failure === 'REFUSED'
                      ? 'REFUSED'
                      : 'FAILED',
                failure,
                execution,
              );
            }
          },
        };
      } catch {
        return null;
      }
    },
  };
}
