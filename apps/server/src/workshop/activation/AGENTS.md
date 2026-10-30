# Confirmed campaign activation (Stage440)

Read the current work order, `docs/STAGE_440_DESIGN.md` and ADR0038.

| Concern                              | Entry points                                                                                                                                                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner review, confirmation and entry | `review.ts`, `review-assets.ts`, `dry-run.ts`, `routes.ts`; public contracts `packages/contracts/src/campaign/activation.ts`                                                                              |
| Durable acceptance and controls      | `store.ts`, `postgres-store.ts`, `postgres-begin.ts`, `postgres-common.ts`; migration0022                                                                                                                 |
| Frozen source and proof              | `content.ts` defensive decoders/light status mapper, `digests.ts`, `submission.ts`, `proof.ts`, `verification.ts`                                                                                         |
| Recovery                             | `runtime.ts`, `worker.ts`, `worker-loop.ts`; publication/content ports under `../../campaigns/`                                                                                                           |
| Focused evidence                     | `storage.test.ts`, `storage-postgres.integration.test.ts`, `worker.test.ts`, `routes.test.ts`, `http-worker.integration.test.ts`; test-only implementations/fixture under `../../testing/activation-*.ts` |

- Owner HTTP accepts only digests/CAS/nonce/acknowledgements. Resolve full content,
  identities, chosen candidates and provenance from owned immutable server rows.
- A start transaction authenticates and freezes explicit USER consent. Exact
  accepted replay precedes fresh-head guards; one draft cannot create two campaigns.
- Durable accepted intent survives tab/session end. Every new owner HTTP operation
  reauthorizes. Recovery finishes the same source; it cannot confirm another revision.
- Begin holds the owned draft lock. Exact request replay precedes current revision,
  lock, manifest and review CAS. Never replace accepted frozen source or allocate a
  second activation/campaign/command ID during retry or recovery.
- Worker claims use database time, a30-second lease and an increasing fence.
  Heartbeats renew every10seconds. A lost lease stops new side effects; an already
  submitted bootstrap may commit. Reconcile its stable command fingerprint before
  publication rather than creating another command or treating phase as proof.
- The worker copies exact stored bytes, seals private content, executes ONE
  BootstrapCampaign through the raw World Engine and verifies actual persisted
  provenance/bytes before one-way publication. Never execute a subcommand loop,
  import fixtures, synthesize an external image job or invoke any provider.
- Ordinary game engines/stores cannot see or mutate provisioning streams. Raw
  engine access belongs only to this narrow bootstrap/reconciler and whole-store
  readiness/replay tools. See `../../campaigns/AGENTS.md` for factory guidance.
- Publication checks actual stored command/final provenance, immutable initial
  content and required byte presence/media type in the same fenced transaction.
  The worker additionally verifies byte hashes/equality and the raw snapshot.
  PUBLISHED is terminal; owner links become visible through that same record.
- Full packages stay out of activation/status/owned-list DTOs. Character preview
  never mounts these owner controls. Entry is a separate ordinary invitation action.
- Poll `repository.status`, not `get`: status/owned queries select public metadata
  without decoding frozen packages. `get`/`byRequest` are owner-qualified internal
  operations for worker/replay and accepted-intent comparison.
- Test memory storage/fixtures live under testing/. Keep source/test modules near
  500lines and split cohesive concerns before700. Recovery/downgrade restrictions:
  `deploy/RUNBOOK.md`§3/§5 and `apps/server/migrations/AGENTS.md`.
