# Stage 150 Completion Report — Asset Identity

- Work order: `work-orders/OPUS_STAGE_150.md`
- Builder: Claude Opus 5.5 (matrix: HIGH)
- Implementation revision: `6ce58af9226a8521f070460b1ec5176d0c347ed9` (branch `main`)
- Formal gate: none at this stage. Gate 05, after Stage 180, reviews this surface (`docs/GATE_COVERAGE.md`, row 150–160).
- Status: **COMPLETE**. Stage 160 is not started and needs explicit authorization.

## Decisions

| ADR                                        | Content                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0022](../docs/adr/0022-asset-identity.md) | Owner decisions of 2026-10-04: (1) an `image-generation` port with a local deterministic placeholder only; (2) authoring commits request references for new NPCs and locations, and the DM may request any entity; (3) candidates until DM approval, versioned replacements, variants from the approved reference, lineage kept; (4) players see only approved images of what they know or perceive, with safe fields only. |
| Amendments                                 | [0006](../docs/adr/0006-temporal-model-and-undo.md) (§9 asset obligation implemented), [0007](../docs/adr/0007-world-kernel-model-and-event-store.md) (asset commands, events, fact keys), [0017](../docs/adr/0017-ai-gateway.md) (image port), [0018](../docs/adr/0018-ai-authoring.md) (commit requests; the preview decides under the commit's command ID)                                                               |

## Delivered

- **Domain (`packages/domain/src/assets/`):**
  - 7 commands and 7 events (`INTRODUCED_AT`); fact keys and restores; integrity rules.
  - Request IDs are `<commandId>#<n>`; asset IDs are `<requestId>~asset`.
  - A job copies its request, so its lineage survives an undone request.
  - The lineage writes no world fact.
- **Undo:**
  - Settling commands (start, complete, fail, cancel, retract) are `UNDO_NOT_SUPPORTED`. The re-decision oracle folds them as recorded.
  - The hold (`hold.ts`) refuses undo of a command that requested an asset while its job runs, or while its image is neither retracted nor discarded.
  - Approval is undoable and restores the reference it replaced.
- **Authorization:** only a system actor reports job outcomes; the DM or a system process requests, cancels, retracts, and approves.
- **Authoring:** `ApplyAuthoring` appends a reference request for each NPC or location it creates. Previews now decide under `authoring.<proposalId>`, so they list the exact request IDs (`authoringCommandId`, shared with the server).
- **Views:**
  - `entityAssetsFor` and `assetContentFor`: players see safe fields of approved player assets of known or perceived entities. Anything else is `null`.
  - The DM may fetch any asset's bytes, candidates included.
  - `assetLineage` gives the DM the full lineage.
- **`@ltw/ai`:** `ImageGenerator` port and `createPlaceholderImageGenerator` (`placeholder-svg-1`). The placeholder draws a seed-derived SVG pattern with no text, and reads no name, description, or note.
- **Server:**
  - `AssetWorker.runOnce`: deterministic system command IDs, a timeout, and crash recovery. `startAssetWorkerLoop` runs it from `main.ts`; settings `LTW_ASSET_WORKER_INTERVAL_MS` (default 5000; 0 disables) and `LTW_ASSET_TIMEOUT_MS` (default 60000).
  - `AssetContentStore`, in memory and on PostgreSQL. Migration `0004_asset_contents.sql`: append-only, 1 byte to 2 MiB, plus an index for the worker.
  - Routes: `GET …/assets` (DM lineage), `GET …/entities/:entityId/assets?perspective=`, and `GET …/assets/content/:contentHash?perspective=` (served with a CSP sandbox, `nosniff`, and `no-store`).

## Validation gate evidence

| Item                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-entity identity          | `lineage.test.ts`: every entity has its own versions and canonical reference. The same bytes for two entities are two assets. A variant derives from its own entity's reference. Requests for missing entities are refused.                                                                                                                                                                                                                                 |
| Lineage and versioning         | `lineage.test.ts`: covers candidate, approval, canonical, and versioned replacement (the old reference `SUPERSEDED`, its bytes kept); variants per label; failure, queued and running cancellation, a late image `DISCARDED`, and retraction. Every world fact and the clock are unchanged by asset work.                                                                                                                                                   |
| Player metadata isolation      | `views.test.ts` and `asset-routes.test.ts`:<br>• the Gate 04 hooded watcher is a 404, identical to a nonexistent entity, until Elowen enters its room; then only variant, version, hash, and media type appear, with no `neverSaid` marker;<br>• DM-only, candidate, retracted, and superseded images, and the secret Ashen Circle, stay hidden;<br>• content is a 404 unless visible, and is served with a CSP sandbox;<br>• the lineage route is DM only. |
| Authoring undo with asset work | `undo.test.ts`:<br>• queued: the undo is allowed and removes the request;<br>• running: `UNDO_UNSAFE`, with `StartAssetJob` named as the blocker; after a cancel the undo is allowed, and a late image is `DISCARDED`, with lineage kept from the job's copy;<br>• completed or approved: refused until retracted;<br>• failed: allowed;<br>• DM requests for the new NPC block the undo as later readers.                                                  |
| Undo contract                  | Settling commands are `UNDO_NOT_SUPPORTED`; approval undo is checked; variant requests and retractions block approval undo. `assets.property.test.ts` runs 8 seeds × 45 random steps (authoring, requests, worker reports, approvals, retractions, undos, and settle-then-undo) with integrity after every step, then the oracle and replay from stored JSON. A final check proves each path was exercised.                                                 |
| Worker and PostgreSQL          | `worker.test.ts`: success, idempotent reruns, failures by code, timeout, cancellation mid-generation, crash recovery, and no names in logs. `assets.integration.test.ts`: the content store is append-only and per campaign; the worker runs on the PostgreSQL engine; undo is refused while the job runs; a reloaded engine replays the lineage; HTTP serves the content.                                                                                  |

**Mutation checks:** 15 of 15 injected defects were detected, one at a time:

- no undo hold;
- the hold ignores completed images;
- the DM may report jobs;
- settling commands are undoable;
- a late image is kept after a cancel;
- authoring requests nothing;
- DM-only assets are shown;
- unknown entities are shown;
- candidates are shown;
- content is served without a visibility check;
- the placeholder draws the name;
- the oracle re-decides settling commands;
- approval undo forgets the replaced reference;
- versions are counted across entities;
- the CSP is missing.

## Validation

`pnpm validate:ci-local` exited 0 on `6ce58af` (`NODE_ENV=test`, docker-compose PostgreSQL). It ran:

- frozen install, format, lint, typecheck;
- context budget: 411 files, none over the limits;
- unit tests: 126 files, 1338 tests passed;
- clean build;
- migrate twice;
- seed twice;
- integration tests: 16 files, 65 tests passed.

## Residual risks and notes

- **Placeholder images only.** No external image provider is configured; a real one, with its prompts, cost, and moderation, needs an owner decision.
- **The worker finds work by scanning** `AssetRequested` events per campaign each tick (indexed). One worker per process; multiple server processes would race. Duplicate steps are idempotent by command ID, but would make duplicate generator calls.
- **Contents are stored in PostgreSQL** (`bytea`, 2 MiB cap), not object storage (`ARCHITECTURE.md`). The `AssetContentStore` port allows a swap.
- **Historical visual state** (assets as of a world time) is Stage 160.
- **The UI is not built yet** (Stages 200–230).
