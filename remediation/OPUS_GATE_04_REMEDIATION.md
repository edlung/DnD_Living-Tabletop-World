# Opus Gate Remediation Report

- Gate: #4 — NPC Isolation
- Astra report: `reviews/ASTRA_GATE_04_REPORT.md` (FAIL: G04-H01 High, G04-M01 Medium, G04-M02 Medium)
- Retest number / required output path: 1 — `reviews/ASTRA_GATE_04_RETEST_1.md`
- Revision before remediation: `0f2ae9071a8b7ac558f7c0b8bae1302f1f15ef9f` (reviewed code; `1e3f2a4` adds only the report and its evidence)
- Revision after remediation: `987c22377bd571c86ad84187e810c95d78b511c5`
- Builder: Claude Opus 5.5, MAX (High remediation per `EFFORT_MATRIX.md`)
- Status: AWAITING_ASTRA_RETEST

The review found no NPC-context leak. All three findings concern adjacent surfaces: authoring concurrency and retries (Stage 110), and monster suggestions (Stage 130). Each finding got a regression test before its fix; each test failed on the reviewed code.

## Finding Remediation

### G04-H01 — Concurrent revision and commit bypass latest-revision confirmation

- **Severity:** High
- **Violated invariant:** 3 (the DM has final authoring authority) and 16 (AI mutations pass confirmation before the World Engine); ADR 0018 §5–§6.
- **Root cause:** Two different stores were checked separately from the writes that depended on them.
  - The commit checked the latest revision in the proposal store, then wrote through the World Engine.
  - The edit checked canon (not committed) and the latest revision, then appended to the proposal store.
  - A revision append does not touch the campaign stream, so the World Engine's optimistic concurrency could not see an edit in between. The revisions table's unique key serializes two edits, but never an edit against a commit.
- **Regression tests added first** (all failed on `0f2ae90`):
  - `apps/server/src/authoring/proposal-races.integration.test.ts`, `G04-H01 proposal_revision_and_commit_are_serializable`. Two server processes, each with its own World Engine and proposal store over one PostgreSQL database, race in both orders.
  - **An edit racing a commit already under way.** The commit is paused right before it writes its events. On the reviewed code the edit finished (201) and the paused commit then committed revision 1 (200). Now the edit waits for the commit, then answers 409.
  - **A commit racing an edit already under way.** The edit is paused right before it stores revision 2. On the reviewed code the commit finished (200) and the edit then stored revision 2 (201). Now the commit waits, then answers 409; the proposal stays a DRAFT at revision 2.
  - **Sequential controls:** an edit voids the earlier confirmation (409); a commit ends editing (409).
  - **After every case, a restarted process** checks that the stored proposal and canon agree. A committed proposal's committed revision is its latest, and canon holds exactly that revision's content; an uncommitted one has nothing in canon. Replay and integrity hold.
  - `apps/server/src/authoring/proposal-store.test.ts`: the in-memory store's sections take turns per proposal, other proposals do not wait, and a failing section gives up its turn.
- **Fix:**
  - `ProposalStore.exclusive(campaignId, proposalId, work)`: a section no other section of the same proposal overlaps, in any process.
    - PostgreSQL: a transaction-level advisory lock (`pg_advisory_xact_lock`) keyed by campaign and proposal. Ending the transaction, or losing the connection, releases it.
    - It is held on a connection of a separate pool (`main.ts`, 4 connections). Sections wait for the event store's connections while they run, so sharing one pool could leave every connection held by a waiting section.
    - In memory: a per-proposal queue.
  - `AuthoringService`: edit, commit, and undo each read the latest revision and canon inside the section, and write inside it.
    - An edit reloads canon there; the snapshot used for authorization is not reused.
    - A commit executes the World Engine command inside the section.
  - ADR 0018 Gate 04 amendment.
- **Why this fixes the boundary rather than only the symptom:** an edit, a commit, and an undo of one proposal now each check and act inside one critical section that excludes all three, across processes.
  - Whichever request enters second sees the first one's write: the new revision, or the commit in canon.
  - No second unprotected read decides anything.
  - Atomic world mutation stays the World Engine's: nothing new is written to canon, and the lock holds no event-store transaction.
  - The latest-revision rule and the single commit per proposal are unchanged.
- **Validation evidence:** the regression file passes. Mutation checks, each alone, were detected:
  - no advisory lock;
  - the edit reusing the snapshot read before its section;
  - in-memory sections overlapping.

### G04-M01 — Monster suggestion ignores the reaction pause

- **Severity:** Medium
- **Violated invariant:** 9 (rules decide legality); ADR 0020 §5 promises a legal action, and ADR 0016 §1 pauses the encounter.
- **Root cause:** The suggestion asked only the action planners (`monsterSpellPlan`, `attackPlan`, `movePlan`). The pause is a separate kernel rule (`pausedCombat`) that the World Engine applies before deciding, so a suggestion could name a command the engine refuses (`REACTION_PENDING`).
- **Regression tests added first** (both failed on `0f2ae90`):
  - `packages/combat/src/suggestion.test.ts`, `monster_suggestion_is_unavailable_while_reaction_pending (G04-M01)`. The Shaman's suggested cast opens Elowen's window, and the suggestion is then null, on a restarted engine too. After the DM closes the window, a suggestion returns and is accepted as is.
  - `apps/server/src/http/encounter-routes.test.ts`, `suggests nothing while a reaction window is open (G04-M01)`. Over HTTP, suggested turns are played until a window opens; the route then answers `suggestion: null`. After the close, the suggestion is accepted.
- **Fix:** `suggestMonsterTurn` checks the command it would suggest with the kernel's own pause rule (`pausedCombat`, now exported by `@ltw/domain`) and suggests nothing while it refuses. ADR 0020 amendment.
- **Why this fixes the boundary rather than only the symptom:**
  - The suggestion now passes through every rule the World Engine applies before deciding a combat command: the shared planners, plus the pause predicate the engine itself uses.
  - It is not a second, parallel window check that could drift from the engine.
  - Command validation is unchanged, and nothing answers the window.
- **Validation evidence:** the two regressions pass. The whole-fight test still accepts every suggested command. Removing the pause check is detected.

### G04-M02 — An identical successful commit cannot be retried idempotently

- **Severity:** Medium
- **Violated contract:** ADR 0018 §5 ("A retry is idempotent (`duplicate`)").
- **Root cause:** The service refused any already-committed proposal (409) before the World Engine could recognize an identical submission by its fingerprint. A Stage 110 test had pinned that 409, and the Stage 110 report listed it as a residual risk.
- **Regression tests added first** (failed on `0f2ae90`):
  - `proposal-races.integration.test.ts`, `G04-M02 identical_authoring_commit_retry_returns_original_duplicate`.
  - An identical retry answers 200 with the original command as `duplicate`, on the same process and on a restarted one. The event count is unchanged.
  - A different confirmation and a different revision answer 409.
  - Undo retries the same way (`duplicate`), and after an undo the identical commit retry still answers the original command, applying nothing.
  - `apps/server/src/http/authoring-routes.test.ts`: its assertion that a retry is 409 now expects `duplicate`, and a different confirmation 409.
- **Fix:** Inside the proposal's exclusive section, the commit requires the latest revision, then always submits to the World Engine. The engine answers an identical submission with the original command (`duplicate`), and any other second commit with `COMMAND_ID_CONFLICT`, still mapped to 409.
- **Why this fixes the boundary rather than only the symptom:**
  - "Is this the same request?" is decided by the one authority on command identity, the World Engine's fingerprint.
  - Once committed, a proposal cannot gain a later revision (G04-H01), so the same revision and confirmation reproduce the same command exactly.
  - The single commit per proposal remains.
- **Validation evidence:** the regression passes. Restoring the early refusal is detected.

## Full Validation

| Command                         | Result                                                                                                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm validate:ci-local`        | PASS on `987c223` (`NODE_ENV=test`, docker-compose PostgreSQL 18): frozen install, format, lint, typecheck, budget, unit tests, clean build, migrate twice, seed twice, integration tests |
| `pnpm test`                     | PASS — 117 files, 1273 tests (4 more than the reviewed revision)                                                                                                                          |
| `pnpm test:integration`         | PASS — 15 files, 61 tests (4 more), including `proposal-races.integration.test.ts`                                                                                                        |
| `pnpm context-budget`           | PASS — 378 active files, none over 500 or 700 lines                                                                                                                                       |
| Mutation checks (one at a time) | 5 of 5 detected: no advisory lock; the edit using its pre-section snapshot; the commit refusing any second commit; in-memory sections overlapping; the suggestion ignoring the pause      |

## Deferred Findings

None.

## Retest Request

Astra:

- Independently retest G04-H01, G04-M01, and G04-M02, and their adjacent attack paths:
  - edits (DM-written and option revisions), commits, and undos racing in every order, in one process and across processes;
  - identical and differing retries, before and after a restart and an undo;
  - suggestions during and after reaction windows.
- Recheck the Gate 04 objectives this review found holding: NPC context isolation and provider requests, disclosure, showing evidence, Insight, permissions, traces, earlier writers, and the Stage 100–120 surfaces.
- Write `reviews/ASTRA_GATE_04_RETEST_1.md`. The handoff `handoffs/ASTRA_GATE_04_REQUEST.md` is updated to retest 1 with this output path.
- Preserve the initial report and its evidence. Do not rely on this report's claim that a fix is correct.

## Hard Stop

Opus stops here. Do not begin Stage 140 until Astra writes PASS.
