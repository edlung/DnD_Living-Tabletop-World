# 0018. AI authoring: proposals, validation, confirmation, commit, and undo

- Status: Accepted
- Date: 2026-10-04
- Stage: 110; extended by Stages 120 (continuity), 150 (asset requests), 230 (authoring UX)
- Decision type: product (owner-approved scope, risk policy, warnings, undo) and technical
- Owner approval: on 2026-10-04, before implementation, the owner chose:
  1. the enabled operations in §2;
  2. every commit is confirmed by the DM, and L4 never commits (§4);
  3. the three warnings in §3 may be accepted after acknowledgement, and every other conflict blocks;
  4. undo with explicit blockers (§7).

## Context

Stage 100 (ADR 0017) turns the DM's words into a proposal that is never committed. Stage 110 adds the path from a proposal to canonical state. It must apply invariant 16 (schema → permission → rules → continuity/lore → risk/confirmation → World Engine) and invariant 17 (no partial mutation). It must keep 2 and 3 (the AI proposes; the DM decides) and record provenance (18). `docs/IMPLEMENTATION_PREREQUISITES.md` sets the minimum: revalidation at commit, atomic rejection, stale-proposal and missing-confirmation tests, and edits that invalidate confirmation. ADR 0006 §9 assigns Stage 110 the safe Tomas undo path.

## Options considered

1. **Submit each proposed command on its own.** Simple, but a failure partway leaves a partial mutation, and nothing undoes the proposal as a whole.
2. **An engine transaction over several kernel commands.** Atomic, but it writes several command records, so undo and provenance have no single unit.
3. **One composite kernel command, `ApplyAuthoring`.** Its operations are decided in order against provisional state and appended as one command. This is atomic, gives one undo unit and one provenance record, and reuses each operation's own World Engine rules. Chosen.

For preview and confirmation, a stateless token over content the client resends would let a client commit content it never previewed. **Server-stored proposal revisions** were chosen instead: the preview and the commit run the same assessment on the stored content.

## Decision

### 1. Pipeline

| Stage                 | Where                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema                | `@ltw/contracts` (`authoring/`): proposals, revisions, the `ApplyAuthoring` command; strict                                                                         |
| Permission            | HTTP routes: DM only, in the ADR 0009 check order. `authorize`: `ApplyAuthoring` is accepted only from the campaign's DM; the system actor is refused (invariant 3) |
| Enabled operations    | `packages/domain/src/authoring/policy.ts` (§2)                                                                                                                      |
| Rules                 | Each operation's own World Engine decision, in order, on the state its predecessors produce                                                                         |
| Continuity/lore       | `authoring/continuity.ts`: blocking errors and warnings (§3)                                                                                                        |
| Risk and confirmation | `authoring/policy.ts` (levels); proposal revisions and preview (§5); the commit-time consent gate in the World Engine (§4)                                          |
| World Engine          | One command, one append (§6)                                                                                                                                        |

### 2. Enabled operations (owner decision)

| Operation             | Enabled for                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| `CreateEntity`        | kind `npc`, with an optional placement; backdated existence and placement as ADR 0006 §3 allows |
| `AddKnowledge`        | a record held by an NPC (scope `NPC`) of type TESTIMONY, RUMOR, FACT, EVIDENCE, or SECRET       |
| `SetDisclosure`       | whether an NPC shares one of its records when asked (ADR 0013 §3)                               |
| `UpdateEntityProfile` | an NPC's name or description                                                                    |
| `PlaceEntity`         | moving an NPC                                                                                   |

Everything else in a proposal is unsupported and blocks the commit (`AUTHORING_UNSUPPORTED`):

- deaths and destruction (`ChangeEntityStatus`) and advancing time (`AdvanceWorldTime`), which are destructive or global (L4);
- creating locations, factions, items, or other kinds;
- knowledge in the PUBLIC, PARTY, CHARACTER, WORLD_TRUTH, or DM scopes;
- the types INFERENCE, HYPOTHESIS, CONTRADICTION, and UNKNOWN.

Stage 100's proposals may now also contain `SetDisclosure`.

### 3. Validation (owner decision for warnings)

**Blocking**, reported per operation with its index:

- every rejection of the operation's own World Engine decision: unknown, destroyed, or non-location targets; used IDs, including those tombstoned by undo; existence or placement after the clock or outside existence; a knowledge holder that is not an NPC or did not yet exist; testimony without a speaker; and so on;
- an unsupported operation (§2);
- **`KNOWLEDGE_BEFORE_SUBJECT`:** a record known earlier than one of its subjects or its speaker existed (impossible history; ADVERSARIAL B2/D1).

**Warnings** the DM may accept. Each has a stable key, `CODE@index` or `CODE@index:entityId`:

- **`NAME_IN_USE`:** a created or renamed NPC has the name of another entity (case-insensitive).
- **`WITNESS_ELSEWHERE`:** a first-hand record (TESTIMONY the holder gave, or EVIDENCE) about a location, where the holder was not at that location, inside it, or around it at the time the record says it was known. This is the "timeline-conflicting authoring produces a warning" case in `RAVENFORD_SPEC.md`.
- **`SECRET_SUBJECT`:** an NPC's record about an entity that neither the PUBLIC perspective nor the party knows, and that the proposal does not create.

Stage 120 adds further checks, explanations, and options. It does not relax these guards or make earlier commits retroactively valid.

### 4. Risk and confirmation (owner decision)

| Level | Operations                                                                                                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| L1    | renaming, redescribing, or moving an NPC; `SetDisclosure` GUARDED                                                                          |
| L2    | creating an NPC; an NPC record about public or newly created entities; `SetDisclosure` WILLING on such a record                            |
| L3    | a SECRET record; a record about, or attributed to, a non-public entity (§3); `SetDisclosure` WILLING on a record about a non-public entity |
| L4    | `ChangeEntityStatus`, `AdvanceWorldTime`: never committed in Stage 110                                                                     |

A proposal's level is the highest of its operations. **Every commit needs the DM's confirmation:** a risk level and the keys of the warnings acknowledged.

**The consent gate.** When the World Engine decides `ApplyAuthoring`, the decision also returns what consent the proposal needs: its level and its warnings, both computed on the state at that moment. Before appending, the engine refuses with `CONFIRMATION_REQUIRED` and the current requirement if the confirmed level is lower or a warning is unacknowledged. Acknowledging a warning that no longer occurs is harmless.

**Consent is not a premise.** It is checked when the commit is decided and recorded with the command. It is not part of the decision that the re-decision oracle repeats, and footprints do not record it. Undoing earlier commands may change what a new preview would warn about, but never whether a standing commit is legal. Legality — enabled operations, rules, and blocking continuity — is footprinted and re-decided like any other command.

### 5. Proposals, revisions, and preview

- **Revisions.** A proposal is stored as revisions: DM working data, not canonical. Each revision records its summary, its commands, its source (an AI trace ID, or the DM), its author, and its time. The server resolves missing entity and knowledge IDs when it stores a revision, so what is previewed is exactly what commits. A proposal created from an AI trace copies the trace's validated proposal on the server; a client cannot claim AI provenance for its own content.
- **Edits** append a revision. A commit must name the latest revision. An older revision's preview and confirmation are void (`409`), and every edit gets a fresh preview.
- **Preview** runs the same authorization, decision, and consent computation against the current state whenever the DM reads the proposal. It reports issues, warnings, risk with reasons, the confirmation required, and the events a commit would record now.
- **One commit per proposal.** The commit's command ID is `authoring.<proposalId>`. A retry is idempotent (`duplicate`), and a different revision cannot commit afterwards (`COMMAND_ID_CONFLICT`, mapped to `409`).
- **Provenance** lives on the stored command (invariant 18): the proposal, the revision, the summary, the source (and with it the AI trace: context source IDs, provider, model, attempts), the confirmation, and the DM as actor. Proposals, previews, and provenance are DM data. Player views show the created NPC as any other world entity.

### 6. Atomicity, stale previews, and concurrency

- One kernel command produces all its events in one append, or nothing is stored. Any blocking issue rejects the whole proposal, even when its first operations alone would be valid.
- The commit is decided against the state at commit time, under the World Engine's optimistic concurrency. A preview computed earlier grants nothing: changed facts surface as issues (`AUTHORING_INVALID`), and a new warning or a higher level surfaces as `CONFIRMATION_REQUIRED`.
- When two commits conflict (for example, both create `tomas-reed`), one is accepted and the other is decided against it and rejected.
- The generic `POST /commands` route refuses `ApplyAuthoring`, so every authoring commit passes through the proposal store.

### 7. Undo (owner decision: explicit blockers)

- An authoring commit is undone as one unit: one `CommandUndone` restores every fact it wrote (ADR 0006 §8).
- If a later, still-effective command depends on it — for example, a player learned Tomas's testimony with `AskAbout` — undo is rejected (`UNDO_UNSAFE`) with the blocking commands listed. The DM undoes them explicitly, newest first, through `POST /commands` (`UndoCommand`), then the commit. Nothing is erased silently, and IDs are never reused.

### 8. HTTP (DM only; ADR 0009 order: 401, 400, 404 for a non-member, 403 for a player)

- `POST /campaigns/:campaignId/authoring/proposals`, with `{ traceId }` or `{ summary, commands }`: creates revision 1 and returns it with a preview.
- `GET /campaigns/:campaignId/authoring/proposals/:proposalId`: the latest revision, its status (`DRAFT`, `COMMITTED`, or `UNDONE`), the commit, and a fresh preview while it is a draft.
- `POST /campaigns/:campaignId/authoring/proposals/:proposalId/revisions`, with `{ basedOnRevision, summary?, commands }`: an edit.
- `POST /campaigns/:campaignId/authoring/proposals/:proposalId/commit`, with `{ revision, confirmation }`: the World Engine result, with issues, warnings, or the requirement on rejection.
- `POST /campaigns/:campaignId/authoring/proposals/:proposalId/undo`: the result, with blockers when unsafe.

### 9. Storage

Migration `0003_authoring_proposals.sql` adds `ltw_authoring_revisions`. Like traces it is append-only: triggers reject `UPDATE`, `DELETE`, and `TRUNCATE`. Proposal status comes from canonical state (the commit command and its undo), never from the table.

## Consequences

- Stage 120 widens continuity: relationships, lore, more of time and geography, explanations, and options. It does so behind the same pipeline and gate.
- Stage 150 adds the asset-generation request to commits. Its jobs block undo as ADR 0006 §9 says.
- Stage 230 builds the DM's preview, edit, and confirm UI on these routes. A UI may make L1 confirmation one click, but it cannot remove the confirmation.
- Direct DM commands keep the kernel's own rules. The authoring guards apply to AI-assisted mutations, which pass through proposals.

## Amendments

- 2026-10-04 (Stage 120, ADR 0019; owner decisions of 2026-10-04):
  - **Enabled operations** also include `SetClaim` on records an NPC holds (L2) and `SetRelationship` for an NPC (L2). Claims on clues and on other scopes are unsupported.
  - **Checks.** `KNOWN_AFTER_DEATH` blocks. `SPEAKER_NOT_ALIVE`, `MOVES_THE_DEAD`, `ENCOUNTER_HERE`, `RENAME_KNOWN`, `DUPLICATE_ACCOUNT`, `CLAIM_CONFLICT`, and `DISCLOSURE_AGAINST_ATTITUDE` warn. `CLAIM_AGREES` is a note.
  - **Issues have keys** (`CODE@index[:entityId]`, or `CODE@all`). Every issue and warning carries options. A revision may come from an option on the DM's request (`{ basedOnRevision, optionId }`); the revision records the option it applied.
  - **Premises.** A commit giving knowledge to an NPC that existed before the proposal records `AuthoringPremisesRecorded` (that NPC's existence and status), because `KNOWN_AFTER_DEATH` read its status history.
- 2026-10-04 (Gate 04 remediation, G04-H01 and G04-M02):
  - **Edits, commits, and undos of a proposal take turns** (§5–§6). Each checks and acts inside the proposal's exclusive section, reading canon there. Across processes this is a PostgreSQL advisory lock per proposal, held on connections of its own pool. An edit after a commit, and a commit of a revision an edit replaced, are `409`, whichever request arrived first; both can no longer succeed. This replaces the Stage 110 behavior in which the confirmed earlier revision could commit while an edit was stored.
  - **An identical commit retry returns the original command as `duplicate`**, as §5 states, after a restart too. A different confirmation or revision is still `409`.
- 2026-10-04 (Stage 150, ADR 0022 §2; owner decision of 2026-10-04):
  - **A commit that creates an NPC or a location also requests its visual reference.** The `AssetRequested` events are part of the commit's command, after its operations' events.
  - **The preview decides under the commit's own command ID** (`authoring.<proposalId>`), so the changes it lists match the events the commit records exactly, including request IDs.
  - **Undo.** Undoing the commit is held while a requested job runs, or while its image stands, until the DM cancels the job or retracts the image (ADR 0006 Stage 150 amendment).
- 2026-10-28 (owner decisions 11, SI-D1 and SI-D8; `reviews/OWNER_DECISIONS_11_2026-10-28.json`):
  - **Open drafts are listed.** `GET /campaigns/:campaignId/authoring/proposals` returns the campaign's drafts that are neither committed nor cancelled, as `{ proposalId, revision, summary, source, updatedAt }`, the most recently changed first (ties by the larger proposal ID), at most 20. Same check order as §8 (401, 400, 404 for a non-member, 403 for a player, with the fixed bodies); no proposal content reaches a refusal.
  - **A cancel is stored.** `POST …/proposals/:proposalId/cancel` appends a closing revision (`cancelled: true` in the revision document; §9 stays append-only, no migration). A cancelled proposal reads as `CANCELLED` with no preview; an edit or commit of it is `409`; cancelling it again changes nothing; cancelling a committed proposal is `409`. Status other than `CANCELLED` still comes from canon.
  - **The DM's own proposal edits an NPC.** A DM-written proposal of one `UpdateEntityProfile` (already enabled at L1 by §2) is how the DM's NPC card changes a name or description; no new canonical command. Only changed fields are sent; an empty name or description means "unchanged", so clearing a description is not supported yet.
  - **Storage of the list (review of 2026-10-28).** Migration `0013_authoring_open_drafts.sql` adds the index `(campaign_id, proposal_id, revision DESC)`; the list reads each proposal's latest revision with only the fields it shows, leaves out cancelled and committed ones in SQL, and pages newest first with a keyset cursor (the service still checks canon and stops at 20). The same migration appends a cancelled closing revision (`created_by` `migration:0013`) to every proposal open when it runs and not committed: before this release a cancel was the screen's alone, so those drafts were discarded or abandoned and were never restorable. It never touches a committed or already cancelled proposal, and running its statement again changes nothing.

## Invariants affected

Implements 2, 3, 16, 17, and 18 for authoring; preserves 1, 5, 11, 12, and 13. No invariant is weakened.
