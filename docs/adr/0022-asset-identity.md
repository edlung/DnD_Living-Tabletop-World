# 0022. Asset identity: visual references, variants, generation, and lineage

- Status: Accepted
- Date: 2026-10-04
- Stage: 150; reviewed at Astra Gate 05 with the integrated backend
- Decision type: product (owner-approved generation, triggers, approval, and visibility) and technical
- Owner approval: on 2026-10-04, before implementation, the owner chose:
  1. an `image-generation` port with a deterministic local placeholder generator and no external calls; a real provider is a later decision (§3);
  2. an authoring commit that creates an NPC or a location requests its reference, and the DM may request any entity explicitly (§2);
  3. a generated image is a candidate until the DM approves it as the canonical reference; variants derive from the approved reference; a replacement needs a new approval, and the old one stays in the lineage (§1);
  4. players see assets only of entities their character knows or perceives, and only the variant, version, and image link; the DM sees everything (§5).

  ADR 0006 §9, approved earlier: a started external job cannot be recalled. It blocks undo of what it depicts until its outcome is explicitly cancelled or retracted. Generated assets are retained for lineage.

## Context

`EXECUTION_PLAN.md` (Stage 150): visual identity, canonical references, assets, variants, generation requests, entity linkage, versioning, and lineage. Invariant 14: visual state is not world state. Invariant 13: entity identity is stable across time. The validation gate: cross-entity identity, lineage, player-facing metadata isolation, and authoring undo with queued or in-flight asset work, under the existing temporal and undo contract (ADR 0006).

## Options considered

1. **Assets in a separate mutable table, outside the campaign stream.** Rejected: lineage would not be replayable, and undo could not see the external work that depicts an entity.
2. **Asset events whose settlement reads the entity.** Rejected: under footprint undo (ADR 0006 §8), a failed or cancelled job would then block undo of what it depicted forever.
3. **Lineage in the campaign stream, never read by gameplay; settlement final; a dedicated undo hold.** Chosen.

## Decision

### 1. Identity and lineage (owner decision 3)

- **Where it lives.** The lineage is recorded in the campaign's event stream, so it is auditable and replays exactly. No gameplay decision reads it, and no asset event writes a world fact: assets depict entities; they are never world state.
- **Records.**
  - A **request** (`AssetRequested`) asks for an image of one entity: a `reference` (its visual identity) or a `derived` variant with a label (for example `night`). Its audience is `players` (default) or `dm`. Its ID is `<commandId>#<n>`, so it is never reused.
  - A **job** is one external run of a request. Starting it copies the request, so the lineage survives an undo of the request.
  - An **asset** is what a job produced: content hash, media type, and the generator's provider and model. Its ID is `<requestId>~asset`.
  - Each entity has at most one **canonical reference**.
- **Versions.** An asset's version counts the earlier assets of the same entity, variant, and label, plus one. Each entity has its own count.
- **Statuses.** An asset is a `CANDIDATE` until the DM approves it (`ApproveAsset`):
  - an approved reference becomes `CANONICAL`, and the reference it replaces becomes `SUPERSEDED`, kept with its bytes;
  - an approved variant becomes `APPROVED`, and the canonical reference is unchanged;
  - `RetractAsset` makes any asset `RETRACTED`, and a retracted canonical reference leaves the entity without one;
  - an image that arrives after its job was cancelled is recorded as `DISCARDED`: kept for lineage, never shown, never approvable.
- **Variants.** A derived variant can only be requested while the entity has a canonical reference, and it records that reference. Approving a variant never changes the reference.

### 2. Requests (owner decision 2)

- **Authoring.** An authoring commit (`ApplyAuthoring`) that creates an NPC or a location appends a reference request for it, for players, sourced from the proposal. The request is part of the commit's own command, so the preview shows it with the ID the commit will record (the preview now decides under the commit's command ID, `authoring.<proposalId>`).
- **Explicit.** The DM, or a system process, issues `RequestAsset` for any existing entity, through the command route. Players cannot.
- **Footprint.** A request reads the world clock and its entity's existence, plus the canonical reference a derived variant derives from. It writes only the request. So, while the request stands:
  - undoing what created the entity is refused;
  - undoing the approval a variant derives from is refused.

### 3. Generation (owner decision 1)

- **Port.** `@ltw/ai` defines `ImageGenerator.generate(brief, signal)`, which returns bytes, a media type, and the model; it stays pure. The capability is `image-generation` (ADR 0017).
- **The brief** holds a per-request seed, the entity's kind, name, and description as the DM knows them, the variant, label, and note, and the content hash of the base reference. It is DM data: never stored and never shown to players.
- **The local placeholder generator** (`placeholder-svg-1`) is the only generator.
  - It draws a deterministic SVG pattern from the seed, label, and base, with no external call.
  - It draws no text and ignores the name, description, and note, so an image cannot name its entity.
- A real provider, with its prompts, costs, and moderation, is a later decision.

### 4. The worker, external jobs, and undo (ADR 0006 §9)

- **The asset worker** is a trusted system process (`asset-worker`). Each run:
  1. records the start of each queued request (`StartAssetJob`);
  2. asks the generator, within a timeout;
  3. stores the bytes (§6);
  4. records `CompleteAssetJob` or `FailAssetJob` (`PROVIDER_ERROR`, `REFUSED`, or `TIMEOUT`).

  Command IDs derive from the request ID, so a retried step is the same command, and a job a crash left running is finished on the next run. The server runs the worker every `LTW_ASSET_WORKER_INTERVAL_MS` (default 5000; 0 disables it); a generation fails after `LTW_ASSET_TIMEOUT_MS` (default 60000).

- **Who reports.** Only a system actor may report job outcomes; the DM cannot claim that external work happened. The DM and system processes may request, cancel (`CancelAssetRequest`), retract, and approve.
- **Settlement is final.** Starting, completing, failing, cancelling, and retracting report or settle work outside the campaign. They cannot be undone (`UNDO_NOT_SUPPORTED`). The re-decision oracle folds them as recorded. They read nothing a world command wrote, so they never block a world undo by themselves.
- **The hold.** Undoing a command that requested an asset is refused (`UNDO_UNSAFE`) in two cases:
  - while the job runs;
  - while the image it produced is neither retracted nor discarded.

  The blocker named is the latest job or approval command. The DM cancels the job, or retracts the image, and then undoes.

- **What the hold allows:**
  - a queued request: the undo removes it;
  - a failed job, a cancelled job, or a retracted image: its lineage stays, with the entity gone.

  A job cancelled while running may still complete later; its image is then discarded.

- **Approval** is undoable. It restores the approved asset and the reference it replaced, unless a later command read or wrote them (for example, a variant request or a retraction).

### 5. Who sees what (owner decision 4)

- **Players.** A non-DM perspective sees the approved assets (`CANONICAL`, `APPROVED`) for players of the entities it knows (ADR 0008) or that are perceived (ADR 0012):
  - a character perspective counts what its holder perceives;
  - the party perspective counts what any party member perceives;
  - the public perspective counts nothing perceived.

  For each asset, a player sees only the variant, version, content hash, and media type. A player never sees request or asset IDs, labels, notes, briefs, the generator, statuses, lineage, DM-only assets, candidates, or retracted, superseded, or discarded images.

- **Not visible means not found.** An entity the perspective neither knows nor perceives is a 404, identical to a nonexistent one. A perceived but unknown entity, such as Gate 04's hooded watcher, shows its image and nothing that names it.
- **The DM** sees every approved asset of any audience, and the whole lineage: requests with their status and failures (including requests an undo removed, from their job's copy), assets, and canonical references.
- **Routes:**
  - `GET /campaigns/:campaignId/assets` returns the lineage. It is DM only: a player gets 403, and a non-member gets 404.
  - `GET /campaigns/:campaignId/entities/:entityId/assets?perspective=…` returns an `EntityAssetsResponse`.
  - `GET /campaigns/:campaignId/assets/content/:contentHash?perspective=…` returns the bytes (§6).

### 6. Content storage and serving

- Bytes are stored per campaign by content hash (`sha256:<hex>`), from 1 byte to 2 MiB, in `ltw_asset_contents` (migration `0004_asset_contents.sql`). The table is append-only; storing the same bytes again is a no-op. Tests use an in-memory store.
- The bytes are not canonical state. The lineage says which asset holds them and who may see them. `ARCHITECTURE.md`'s object storage can replace the table behind the `AssetContentStore` port.
- The content route serves bytes only when the perspective may see some asset with that hash (§5); otherwise it returns 404, as for unknown content. The DM may fetch any asset's bytes, so it can look at a candidate before approving it. The response sets:
  - the media type;
  - `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`;
  - `nosniff` and `no-store`.

## Consequences

- **Stage 160** (world visual state) builds presentation from the canonical reference and approved variants. Historical visual state, as of a world time, will need the lineage's record times.
- **Gate 05** reviews this surface (`docs/GATE_COVERAGE.md`, row 150–160).
- **Image quality.** Placeholder images carry identity, not likeness, until a real generator is approved.
- **History.** Asset lineage grows with every request; nothing is deleted.

## Amendments

- 2026-10-04 (Stage 160, ADR 0023 §4):
  - **Presentation picks the image.** A presentation chooses among an entity's current approved images by state tags.
  - **Content for a past view.** The content route accepts `at`, serving the bytes of what the perspective could see at that world time.
- 2026-10-16 (Stage 330 part B review, ADR 0035 amendment "an approval supersedes its kind"):
  - **An approved variant supersedes its kind.** Approving a derived picture makes the approved pictures of its kind (§1 statuses: the same entity and purpose, and for an image the same label) `SUPERSEDED`, as approving a reference always did to the canonical reference; the canonical reference is still unchanged. `AssetApproved` is version 3; version 2 approvals are canon as recorded.
- 2026-10-27 (Gate 06 remediation, G06-images-01, -02, -03):
  - **Players get only what presentation could choose (§5, §6; ADR 0023 §4).** A non-DM perspective's asset list and its content-by-hash check expose only the pictures presentation could choose for it (now, or at `at` for content): the canonical reference, each approved derived image whose every label part is among the tags it sees of the entity, the figure and the battle map (`presentableAssets`, `../visual/presentation.ts`, the one rule presentation uses). An approved `dead` or `unconscious` picture of an entity the player knows but does not observe in that state is a 404 like a nonexistent hash, and absent from the list. The DM is unchanged. The list keeps no `at`; the client fetches a picture chosen for a past time (a Chronicle page, a flashback) with that time.
  - **No version for players (§5).** The player's view is variant, purpose, content hash and media type: the version counted the DM-only, candidate and retracted pictures of its kind, so a player could see that hidden ones existed. The DM's lineage keeps versions; presentation still orders by them.
  - **The placeholder draws nothing of the label (§3).** A derived variant's frame is hued from the request's seed and base, never from its label, which a player could recover from the bytes.

## Invariants affected

Implements:

- 13 (stable identity: the lineage is keyed by entity ID);
- 14 (visual state is not world state).

Extends 11 and 12 (undo and reconstructable history) to external work, as ADR 0006 §9 declared. Preserves:

- 3 (only the DM, or a trusted system process, decides);
- 5 (scoped visibility);
- 18 (each asset records its generator and model).

No invariant is weakened.
