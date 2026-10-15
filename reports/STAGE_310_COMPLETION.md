# Stage 310 — Live session

- Date: 2026-10-15 (Europe/Oslo). Branch `stage-310-live-session`.
- Status: **IMPLEMENTED (parts A, B and C); OWNER PLAY ACCEPTANCE PENDING.** The owner deferred
  play acceptance of this stage; per `AGENT_WORKFLOW.md` (Product Acceptance) the stage is complete
  only after the owner plays its affected flows. An independent adversarial review of parts B
  and C (a fresh agent, read-only) found three defects; all are fixed in `e7507fd` (below).
- Work order: `work-orders/OPUS_STAGE_310.md`. Contract: `docs/STAGE_310_DESIGN.md` (draft 2,
  adopted under the owner's delegation, `reviews/OWNER_DECISIONS_9_2026-10-15.json`). Decisions:
  `docs/adr/0033-live-session.md`. Owner decisions Q9 (2026-10-11): the DM may skip an absent
  player's turn or act as that character; hidden changes reveal nothing; presence never transfers
  authority.
- Revisions: part A is commit `13cfaef` (on `edeae54`); parts B and C are the uncommitted working
  tree on top of `13cfaef` (no commit or push was made): 62 changed or new files besides this
  report, manifest SHA-256 `acfa473e14e53e27c54cf24efd1e7f72e18e48c0d44ab95414095805057f59e8`
  (`shasum -a 256` of the sorted per-file `shasum -a 256` lines of `git diff --name-only` plus
  untracked files, this report excluded). After the final `pnpm validate` only Markdown changed
  (two AGENTS/context-map wording fixes and this report); `pnpm format:check` passed again.

## What the stage does

**A. Change signal, presence, live refresh** (commit `13cfaef`; `apps/server/src/live/`). A
`fetch`-read event stream per subscription (`GET …/live`) after the ADR 0009 check order. A signal
is a change of the SHA-256 over the subscriber's own coverage views, each injected with the
subscriber's credential into a silent twin of the application, so the reviewed routes decide what
is visible; a fixed 1 s non-overlapping cycle, baseline before `ready`, 401/403/404 rechecks every
cycle, per-actor (4) and per-process (200) caps, slow-consumer and shutdown closure. Presence
(`GET …/presence`) lists only the perspective's own characters, never actor IDs. The client keeps
one connection per screen, reconnects with backoff, re-reads shown views in the background without
flashing or replacing drafts, shows a connection badge, the table's presence and whose turn it is.

**B. The DM acting for an absent player** (no new authority; the kernel already lets the DM issue
a player's commands, ADR 0013).

- `POST /campaigns/:campaignId/dm/substitutions` (`clientCommandId`, `characterId`, `reason` of
  `absent`, `asked` or `other`, optional `note`) records the DM's reason before the DM submits the
  command with the same client command ID. ADR 0009 order: 401, 400 (strict body, note at most
  200 characters), then the 404 of a missing campaign for anyone who is not the campaign's DM,
  players included; 422 for a character without a player (or not a character); 409 for a
  different reason under the same ID or when that command is already stored; an identical repeat
  answers `duplicate`. The answer is `{status}` only; logs carry the reason code, never the note or
  the character. Rows go to the append-only `ltw_dm_substitutions` (migration 0009): descriptive
  DM data, never canonical.
- In combat (DM perspective, encounter controls) the DM sees, for the character whose turn it is,
  **Skip the turn** (the existing `EndTurn`) and **Act as <name>** (also offered for a character an
  open reaction window still waits on). Either asks why first (no default reason; optional note);
  presence is shown beside the name and decides nothing. A refused skip during an open reaction
  window says so plainly. **Act as** switches the DM to that character's perspective with a bar
  ("Acting as …", the reason, **Stop acting**); the DM then uses that character's own combat
  actions and reactions, and every command first records the reason under its own client command
  ID (a lost response retries both safely). Choosing another perspective ends it. Nothing of this
  renders for a player or in a lower perspective outside the DM's explicit choice.

**C. The DM history and the day control.**

- `GET /campaigns/:campaignId/dm/history?perspective=DM[&before=<sequence>]`: 404 for anyone but the
  DM, 403 for every lower perspective, the DM's own included (refused without looking at what it
  names). Newest first, 20 per page, paged by the command's first sequence: authoring commits
  (`ApplyAuthoring`, with the summary) and player commands the DM issued for a character that had a
  player when they were decided (the command as submitted, without its recorded draws; the stored
  reason only when recorded for that same character). Each has its canonical status (`COMMITTED` /
  `UNDONE` from the stored commands and `CommandUndone`) and, when committed, whether undo is
  possible now: `previewUndo` (`packages/domain/src/kernel/decide/undo-preview.ts`) runs the World
  Engine's own `authorize` and `decide` for `UndoCommand` against the snapshot and commits nothing;
  blockers are the kernel's. Results are memoized per campaign history. The view is in the DM
  perspective's live coverage inventory only.
- The DM's authoring panel shows it as **History and undo (DM)**: undo through the existing routes
  (an authoring commit through its proposal's undo, anything else as `UndoCommand`), blockers each
  with "Undo “…” first", read from the server so it survives a reload and a perspective change; the
  world screen remounts on a perspective change, which drops every row. It replaces ADR 0029 §8's
  screen-local undo: the proposal review no longer offers undo.
- The day control offers the morning after the current world time ("Advance to Day N+1, 10:00",
  Russian «Перейти к дню N+1, 10:00»), read from the viewed place's scene and re-read after each
  command; time still moves only through `AdvanceWorldTime`.

## Validation (offline; no provider was called, `.env.local` was not read)

Final `pnpm validate` on the working tree (exit 0, 2 min 14 s): `prettier --check .`; ESLint with
zero warnings; `tsc`; context budget 777 active files, 0 over the 500-line target; unit tests
226 files / 2,462 tests; build; `db:migrate` (migration 0009 applied to the local database in the
previous run, nothing pending); `seed:ravenford` (idempotent, 91 duplicates); integration
34 files / 186 tests (PostgreSQL 127.0.0.1:54329); Playwright 58 Chromium journeys, all passed.
Part A's recorded result was 2,422 unit, 182 integration, 53 E2E; parts B and C add 7 unit files
(40 tests), 1 integration file (4 tests) and 5 journeys. Repeated runs: before the journey timing
fix noted under Limitations, the act-as journey failed in 4 of 12 loop runs of the affected
journeys (`live-stand-in`, `dm-history`, `authoring-undo`, `dm-tools`, `live-world`,
`live-combat`) while 3 full-suite runs passed; after the fix those journeys passed 8 consecutive
runs, and then the final `pnpm validate` above.

New tests. The server route tests (`substitution-routes`, `history-routes`, `stand-in`,
`dm-live`) and the dry-undo test were run and seen failing before their implementation; the
others were written with or after the code.

- `apps/server/src/dm/substitution-routes.test.ts` — check order, identical 404 bodies for a player
  and a missing campaign, validation (IDs, reason, note 200/201, injected `actorId`/`campaignId`),
  idempotency and conflict, refusal of unknown, playerless and non-character IDs, reason before
  command, no world content echoed, no view of any perspective changes, no note in logs.
- `apps/server/src/dm/history-routes.test.ts` — check order (403 for PARTY, PUBLIC, CHARACTER,
  CHARACTER:nobody, NPC), cross-campaign 404 both ways, listing rules, blockers identical to the
  undo route's refusal, status after undo, paging without gaps or repeats, a fresh application over
  the same stores.
- `apps/server/src/dm/stand-in.test.ts` — kernel unchanged: a player cannot act for another player's
  character or a creature (403); the DM's `EndTurn` for a player's character is `REACTION_PENDING`
  while a window waits; the DM's commands are stored with the DM as issuer and no controller
  premise; a reason recorded for another character is not attached; undo of a DM skip.
- `apps/server/src/dm/dm-live.test.ts` — a recorded reason signals nobody; its command signals the
  DM and the character's readers. `apps/server/src/live/inventory.test.ts` — `dm/history` only in
  the DM perspective.
- `apps/server/src/dm/dm.integration.test.ts` — append-only rows, constraints, racing records settle
  on one row, the history after a restart over PostgreSQL.
- `packages/domain/src/kernel/decide/undo-preview.test.ts` — equals submitting the undo, including
  over three randomized histories; commits nothing.
- Client: `apps/web/src/dm/world-time.test.ts` (Day 1/2/3 labels; never a day already reached),
  `dm/history-text.test.ts` (wording, Russian names for every command type),
  `combat/stand-in.test.ts` (who may be stood in for).
- Journeys: `tests/e2e/live-stand-in.spec.ts` (the DM skips an absent player's turn and her screen
  follows; the DM acts as Elowen with a reason, moves and attacks, her screen follows, the history
  lists both with blockers and undoes them; a skip during an open window is refused and explained,
  the DM answers the reaction as absent Seren, then skips), `tests/e2e/dm-history.spec.ts` (an
  authoring commit listed after a reload with a working undo; no history, read or row for a player
  or in a lower perspective). Changed: `authoring-undo.spec.ts` undoes from the history list with
  the same assertions (plus the review now showing `Undone`); `dm-tools.spec.ts` gained the
  day-control check.

## Deviations

Part A (implemented in `13cfaef`):

1. Optional focus/place views that answer 404 are fingerprinted by their status (they do not close
   the stream).
2. The DM's identity view is left out of the fingerprint while the DM holds a lower perspective
   (it lists hidden characters).
3. `entities/:focus/context` is covered only for character perspectives (others get 403).
4. Every `ready` reloads all shown views.
5. Smaller additions: a connecting state; 400 stops reconnecting; `overloaded` as a closed frame;
   the suggestions view's `from` parameter; timers only while subscribed; single-flight background
   reads; a 150 ms focus settle; the identity view re-read; the combat anchor `aria-live="off"`;
   characters without a player shown as not connected.
6. `combat-reactions.spec.ts`'s stale-window journey cuts its player's stream.

Parts B and C (this work):

1. The two `dm/*` routes answer a non-DM member 404, as design §C states, where older DM-only views
   answer 403; the DM holding a lower perspective gets 403 (the perspective-permission step).
2. "DM substitutions" are player commands the DM issued for a character that had a player when
   they were decided (from the roster's assignment history), including commands without a recorded
   reason ("No reason was recorded"); a reason counts only for the same character.
3. Skip also asks for a reason (design §B: "The DM states a reason"; the brief named it for Act as).
4. Act as is also offered for a character the open reaction window waits on, so the DM can answer
   a reaction for an absent player; acting enables combat actions and reactions only (exploration
   actions stay the player's).
5. The substitution route refuses a reason for a command already stored (the reason precedes its
   command) and answers identical repeats as `duplicate`.
6. `previewUndo` was added to `@ltw/domain` (a pure dry run; no rule, authority or event changed);
   `useResource` gained a background `reread`.
7. The review's undo was removed rather than kept beside the history (design: "It replaces the
   screen-local undo"); `authoring-undo.spec.ts` was ported with every assertion kept.
8. Russian names for every command type in undo blockers (they were English before).

## Gate 06 surfaces (row 310; details in `docs/GATE_COVERAGE.md`)

`GET …/live`, `GET …/presence` (part A); `POST …/dm/substitutions`, `GET …/dm/history`, the
`dm/history` entry of the DM perspective's live inventory, `previewUndo`, and the
`ltw_dm_substitutions` table (parts B and C). No reviewed projection, mutation path or
authorization rule changed. One undo rule was corrected (`e7507fd`): undoing a command that created
an entity and also edited its profile or status in the same command threw (pre-existing); such
edits now restore nothing of their own, since removing the entity restores all of its facets. The
client's screen-local authoring undo (alpha row 200–240) was replaced by the history list.

## Adversarial checks tried (all held)

Player, outsider and missing campaign get the same 404 body (request ID aside) from both `dm/*`
routes; input is validated before membership; injected `actorId`/`campaignId`/oversized notes are
400 and never echoed. Reasons for NPCs, locations, the hidden-character sentinel and unknown IDs are 422. A
reason after its command, or a different reason under the same ID, is 409; a player's command
under the same client ID never receives the DM's reason (namespaced IDs). Recording a reason
changes no view of any perspective (the DM's included) and raises no signal. The DM in PARTY,
PUBLIC, CHARACTER (real or not) and NPC perspectives gets 403 and no live coverage of the history;
the browser makes no `dm/history` request outside the DM perspective, and player DOM and API
payloads never contain the DM's note or history. Cross-campaign history is 404 in both directions.
Undo availability equals the engine's actual refusal (same blockers) and computing it leaves the
version and stored commands unchanged. The kernel still refuses a player acting for another
character or a creature, and refuses the DM's `EndTurn` past an open reaction window (server test
and journey). PostgreSQL refuses UPDATE, DELETE, TRUNCATE and malformed rows; racing records keep
one row. Presence never gates the controls (the DM skips while the player is connected).

## Limitations and residual risks

- **Owner play acceptance pending** (deferred by the owner). Independent review: parts B and C
  once (three findings: undo of create+edit commits broke the DM history and stream; the trailing
  re-read missed signalled reads; older history pages flashed on new entries — all fixed with
  regression tests in `e7507fd`); part A was not independently reviewed.
  Hosted CI ran green on `6d3182f` (PR 4) and runs again on the fix commit before the merge.
- **Part A signal ABA window (found while verifying B/C) — fixed by the session, corrected after
  review.** A view change undone within one 1 s comparison cycle never reaches the fingerprint, so
  a screen that read the state in between could keep it, whatever caused that read. The first fix
  trailed only reads no signal caused and timed the trailing read from the read's start; a review
  of `6d3182f` showed that a read a signal caused can catch such a change just as well. Fix
  (client only, no protocol change): in a live session every read of a view (its first load, a
  read a signal caused, a re-read after the viewer's own action) is followed by one trailing
  background re-read `TRAILING_REREAD_MS` (1.5 s, longer than a cycle) after that read
  completed. The trailing read schedules none, a newer read replaces a pending one (its own
  completion schedules the next), and unmounting or re-keying the view cancels it; shown views
  are never remounted, cleared or flashed (`GenerationReads` in `apps/web/src/api/resource.ts`,
  unit-tested with fake timers; `api/live-context.ts`). The act-as journey's one-cycle wait stays
  removed. The authoring and reconnect journeys wait 3 s (was 1.5 s and 2 s) for the trailing
  reads before counting reads or cutting the stream (measured: they end about 1.8 s after the
  stream is live), so the stale-while-cut assertion still proves the reconnect path. Residual:
  back-to-back transient changes, the second caught by the trailing read itself within its
  window, can still leave a screen behind until the next signal or **Refresh world**.
- Act as is offered for any character combatant; for a character without a player the server
  refuses the reason (422) and nothing is done, shown as a message: the client cannot tell
  playerless characters apart because presence and identity deliberately do not reveal control.
- Acting is screen-local: a reload or another perspective ends it (each command already carries its
  reason). Reasons whose command was refused or never sent stay in the append-only table, unshown;
  a reason racing its own command could attach late (descriptive only).
- The history lists only authoring commits and substitutions (not the DM's other commands); an
  authoring entry is undone through the proposal store, which must still hold the proposal.
- Cost: the DM's live comparison reads the history page every second; the command log and the dry
  decisions are memoized per history version, the reasons query runs on each read.
- `pnpm test:e2e` alone needs a prior `pnpm build` after a contract change (Playwright loads
  server test support through package builds); `pnpm validate` builds first.

Stop here: Stage 320 requires explicit owner authorization.
