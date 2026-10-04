# Stage 110 Completion Report — AI Authoring

- Work order: `work-orders/OPUS_STAGE_110.md`
- Builder: Claude Opus 5.5 (matrix: MAX)
- Implementation revision: `046ff4575eb0afebd775db58b9b093f1c2e58594` (branch `main`)
- Formal gate: none at this stage (no Astra switch). Gate 04, after Stage 130, covers Stages 100–130 (`docs/GATE_COVERAGE.md`).
- Status: **COMPLETE**. Stage 120 is not started and needs explicit authorization.

## Decisions

| ADR                                                                                                                                                                     | Decision                                                                                                                                                                                                                       | Approval                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0018](../docs/adr/0018-ai-authoring.md)                                                                                                                                | Authoring pipeline. Proposal revisions and preview. One composite command, `ApplyAuthoring`. Continuity checks. Risk levels and a commit-time consent gate. Undo. DM-only HTTP routes. Append-only revisions (migration 0003). | Chosen by the owner on 2026-10-04, before implementation (`IMPLEMENTATION_PREREQUISITES` Q1 for Stage 110, and ADR 0006 §9): (1) operations: create an NPC; give an NPC its own knowledge and decide whether it shares it; rename, redescribe, and move NPCs — with L4 never committing; (2) every commit is confirmed by the DM; (3) the DM may accept, after acknowledging them, a duplicate name, a witness who was elsewhere, or a secret subject — everything else blocks; (4) undo with explicit blockers. |
| Amendments: [0006](../docs/adr/0006-temporal-model-and-undo.md), [0007](../docs/adr/0007-world-kernel-model-and-event-store.md), [0017](../docs/adr/0017-ai-gateway.md) | ADR 0006: §9 authoring undo implemented. ADR 0007: `ApplyAuthoring` and the engine's consent step (7b). ADR 0017: proposals may include `SetDisclosure`, and the local provider reads the RAVENFORD_SPEC request.              | Follow from ADR 0018                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

**One technical choice to note:** consent is a commit-time gate, not a premise. The World Engine checks the DM's confirmation (risk level and warning keys) against the state at commit. Re-decision does not repeat it, and footprints do not record it. Legality — enabled operations, rules, and blocking continuity — is footprinted and re-decided like any other command. ADR 0018 §4 explains why.

## Delivered

- **Contracts:**
  - `authoring/commands.ts` defines the proposable commands (now including `SetDisclosure`), `ApplyAuthoring`, risk levels, warning keys, confirmation, and source.
  - `authoring/views.ts` defines the previews, proposal views, and requests.
  - Three new rejection codes: `AUTHORING_UNSUPPORTED`, `AUTHORING_INVALID`, `CONFIRMATION_REQUIRED`.
  - The entity and clock command schemas moved to `kernel/world-commands.ts`, so authoring can reuse them without an import cycle.
- **Domain (`packages/domain/src/authoring/`):**
  - **Enabled operations and risk levels** (`policy.ts`).
  - **Continuity** (`continuity.ts`): blocking `KNOWLEDGE_BEFORE_SUBJECT`, plus the warnings `NAME_IN_USE`, `WITNESS_ELSEWHERE` (placement history and location containment), and `SECRET_SUBJECT`.
  - **Assessment** (`assess.ts`): each operation's own kernel decision, applied in order on provisional state, collecting every issue.
  - **`decideApplyAuthoring`** (`decide.ts`).
  - **Consent gate** (`consent.ts`).
  - **`previewAuthoring`** (`preview.ts`).
- **Kernel:**
  - `authorize`: `ApplyAuthoring` is accepted only from the campaign's DM; the system actor is refused.
  - World Engine: resolves the operations' IDs and applies the consent step.
  - The stored-command check now covers resolved operations.
  - `Decision.requires` carries the consent requirement.
  - `foldDraftsWithEvents` exposes the provisional history.
- **Server:**
  - **Proposal revisions**, in memory and in PostgreSQL (`ltw_authoring_revisions`, append-only).
  - **`AuthoringService`:**
    - creates a proposal from an AI trace (content copied on the server) or from the DM;
    - stores edits as revisions with IDs resolved;
    - previews on every read;
    - commits only the latest revision, with command ID `authoring.<proposalId>`;
    - undoes a commit.
  - **DM-only routes** under `/campaigns/:campaignId/authoring/proposals`.
  - **The generic command route refuses `ApplyAuthoring`.**
- **Docs:**
  - ADR 0018 and its index row; amendments to ADRs 0006, 0007, and 0017;
  - `IMPLEMENTATION_PREREQUISITES` now records the decision;
  - the AI context map, `AGENTS.md` files (domain authoring, kernel, server, migrations, ai), and README.

## Validation gate evidence

The gate: "Unknown/destructive/invalid proposals fail closed; no partial mutation; timeline/location/identity/knowledge checks; unauthorized actors; required confirmation; stale previews revalidated at commit; safe/unsafe undo; the valid Tomas path through the same pipeline."

| Item                                                    | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unknown, destructive, and invalid proposals fail closed | `commit.test.ts` covers an unknown command type, a missing confirmation, and malformed fields (`INVALID_COMMAND`). It also covers a death or a time advance (`AUTHORING_UNSUPPORTED`, L4) and illegal operations (`AUTHORING_INVALID`, every issue listed). `assess.test.ts` checks that ten unsupported operations are refused. Over HTTP, `authoring-routes.test.ts` checks for 400 and 422, and that the generic command route refuses `ApplyAuthoring` for the DM and for players.                                 |
| No partial mutation                                     | `commit.test.ts`: an illegal later operation, an unsupported operation, or broken continuity leaves the stream version, entities, and used IDs unchanged. The same holds for refused confirmations. PostgreSQL: `ltw_events` and `ltw_commands` row counts are unchanged after a rejected commit (`authoring.integration.test.ts`). The property test checks after every step that a rejection changed nothing.                                                                                                        |
| Timeline                                                | `assess.test.ts`: existence after the clock; knowledge learned before its holder existed; knowledge about a subject, or from a speaker, before they existed (`KNOWLEDGE_BEFORE_SUBJECT`); a witness who arrived after the event (`WITNESS_ELSEWHERE`); and an existing NPC's placement history, including location containment.                                                                                                                                                                                        |
| Location                                                | `assess.test.ts`: an unknown place, and a non-place. `commit.test.ts`: a location destroyed after the preview.                                                                                                                                                                                                                                                                                                                                                                                                         |
| Identity                                                | `assess.test.ts`: a used ID; the same ID twice in one proposal; a duplicate name on creation or rename (`NAME_IN_USE`). `undo.test.ts`: IDs are never reused after undo.                                                                                                                                                                                                                                                                                                                                               |
| Knowledge                                               | `assess.test.ts`: a holder that is not an NPC; testimony without a speaker; a non-NPC scope; a disallowed type; a secret subject (warning, L3); disclosure of a public or never-shareable record. `player-view.test.ts`: the testimony stays out of the PARTY, PUBLIC, and other-NPC views until Tomas shares it, and players see no provenance.                                                                                                                                                                       |
| Unauthorized actors                                     | A player, a non-member, and the system actor are refused `FORBIDDEN` with nothing changed (`commit.test.ts`). The preview reports `FORBIDDEN` (`assess.test.ts`). HTTP returns 401, 400, 404 (non-member or unknown campaign), and 403 (player) on every route (`authoring-routes.test.ts`).                                                                                                                                                                                                                           |
| Required confirmation                                   | `commit.test.ts` refuses a commit with no confirmation, one below the risk level, or one missing a warning, and accepts one above the level. HTTP: 400 without a confirmation; 409 `CONFIRMATION_REQUIRED` with what is required and what is missing.                                                                                                                                                                                                                                                                  |
| Stale previews revalidated at commit                    | `commit.test.ts`: a new same-name entity after the preview gives `CONFIRMATION_REQUIRED`, and a fresh preview then commits; a location destroyed after the preview gives `AUTHORING_INVALID`; unrelated changes still commit. Edits void older revisions (409), over HTTP in both test files. Racing commits — two engines in memory, two servers on PostgreSQL — end with exactly one accepted.                                                                                                                       |
| Safe and unsafe undo                                    | `undo.test.ts`: a safe undo removes Tomas, his testimony, and its disclosure in one compensation, keeping the history. When the player learned the testimony, `UNDO_UNSAFE` names the `AskAbout`; a memory of Tomas blocks the same way. After the DM explicitly undoes the conversation, the undo succeeds. Integrity and the re-decision oracle pass. The same flow runs over HTTP (`authoring-flow.test.ts`) and on PostgreSQL, across a restart.                                                                   |
| The Tomas path through the same pipeline                | `authoring-flow.test.ts` runs the full path: "Add a young guard near North Gate who saw the caravan leave." → local AI proposal → authoring proposal (L2, no warnings) → DM edit (age and role, disclosure WILLING) → refused commit of the stale revision → confirmed commit with four events. Players do not see Tomas until Elowen goes to the North Gate and asks him; they then get attributed testimony with no provenance. The undo flow follows. A live server run also passed — local provider, dev database. |
| Dependencies under random undo                          | `authoring.property.test.ts` runs 6 seeds × 90 steps, mixing valid, illegal, unsupported, and unconfirmed commits, direct DM edits, player conversations, time, and random undos. After every step and every accepted undo it checks integrity and the re-decision oracle, and at the end replay, the storage round trip, and a reload. Each seed produced 12–17 commits, 3–10 refused confirmations, and both blocked and accepted undos.                                                                             |

**Mutation checks:** I injected 16 defects one at a time and reverted each; every one was detected:

- the engine skips the consent gate;
- consent ignores warnings;
- consent ignores the risk level;
- no `KNOWLEDGE_BEFORE_SUBJECT` check;
- deaths are enabled;
- knowledge is allowed in any scope;
- a secret is rated L2;
- a commit goes through despite issues;
- each of the three warnings is silenced (three mutants);
- the system actor may authorize;
- a stale revision commits;
- players may author;
- the generic route accepts `ApplyAuthoring`;
- the engine leaves record IDs unresolved.

## Validation

`pnpm validate:ci-local` exited 0 (`NODE_ENV=test`, docker-compose PostgreSQL 18). It ran:

- frozen install, format, lint, typecheck;
- context budget: 329 files, none over the limits;
- unit tests: 99 files, 1154 tests passed (77 more than Stage 100);
- clean build;
- migrate twice, including `0003`;
- seed twice;
- integration tests: 13 files, 54 tests passed.

## Residual risks and notes

- **Continuity is limited to the checks listed in ADR 0018 §3.** Statements are not checked against lore. For example, an NPC "lifelong resident" with an eight-month arrival, or a new departure time conflicting with Thorne's without a claim, are not caught. Stage 120 widens continuity behind the same gate.
- **`WITNESS_ELSEWHERE` only checks the places a record names.** Where its other subjects were, such as the caravan's own route, is not modelled.
- **`SECRET_SUBJECT` counts as public only what the PUBLIC perspective knows, plus party members.** An entity the party knows only through its own records is warned about. This over-warns, which is the safe direction.
- **Consent is not part of re-decision**, by design (ADR 0018 §4). An undo can make a new preview warn about a standing commit, but it never makes that commit illegal.
- **A retried commit after success answers 409.** The DM reads the proposal to see that it is `COMMITTED`. If an edit races a commit of the earlier revision, the confirmed revision commits, and the view reports which one.
- **Direct DM commands keep only the kernel's own rules.** The authoring guards apply to AI-assisted proposals (ADR 0018 consequences).
- **No asset-generation request is emitted yet.** That is Stage 150, whose jobs will block undo as ADR 0006 §9 says.
- **The live smoke run left an undone Tomas in the local dev database.** `tomas-reed` is now a used ID there; a new proposal must use another ID or a fresh database.
- **The Anthropic adapter has still not been run against the live API** (Stage 100 note).
