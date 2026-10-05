# Stage 240 — Product validation: usability session

- Date: 2026-10-05 (Europe/Oslo).
- Status: **INCOMPLETE — NO SESSION WAS RUN. Stage 240 is not complete.**
- Work order: `work-orders/OPUS_STAGE_240.md`.
- Build under validation: revision `ccae57f` (Stage 230), clean tree; web bundle
  `assets/index-CG7lCGno.js` SHA-256
  `5de1de92920d25c7ff5fd88f3e10c1949edab57c03f2169edb1a0f8a25a6e2dc`.
- Model exception: the owner told this session (Claude Sonnet 5.5) to proceed instead
  of Opus 5.5/HIGH. Later model/gate requirements are unchanged.

## Result

The validation gate requires a real, uncoached session with real participants. None
took place: this session is an AI agent, has no participants, and a scripted or
simulated walkthrough is explicitly not a substitute (`EFFORT_MATRIX.md`). No
participant, observation, task outcome, assistance event, or acceptance is recorded
here because none exists. Per the work order, validation is recorded as **incomplete**
and work stops for the owner.

## Blocker 1 — the integrated build lacks required Player/DM flows

`EFFORT_MATRIX.md` requires the Stage 230 build to already support every acceptance
flow. Checked against `RAVENFORD_SPEC.md` (Player and DM Acceptance) and the browser
client (`apps/web/src`, covered by `tests/e2e`):

| Acceptance flow                                               | Browser support at `ccae57f`                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| Enter Ravenford, find Mira without an NPC menu                | Yes — Stage 200/210 journeys                                  |
| Discover the caravan; investigate world objects               | Yes — `investigation-journey.spec.ts`                         |
| Surface a contradiction; interact with Orin; memory recall    | Yes — same journey                                            |
| Combat with a contextual reaction (Counterspell / Ignore)     | Yes — `combat-*.spec.ts`                                      |
| DM creates Tomas in natural language; preview/edit/confirm    | Yes — `authoring-flow.spec.ts`                                |
| See Tomas in Ravenford; Player View secrecy; safe/unsafe undo | Yes — `authoring-flow`, `authoring-undo`                      |
| **Return to a changed Ravenford (Day 2) and DM time advance** | **No client UI.** Backend and fixture exist (`day-two.json`)  |
| **Open Chronicle; minimal flashback**                         | **No client UI.** Server routes exist (`chronicle-routes.ts`) |
| **DM performs Tomas as an NPC**                               | **No client UI.** Server dialogue route exists                |

`docs/IMPLEMENTATION_PREREQUISITES.md` ("Pending allocation") records that no stage owns
the Day 2 / time advancement, Chronicle / flashback, and DM performance-of-Tomas UI; it
was to be settled when planning Stages 200–230. It was not, and Stages 200–230 as
authorized did not add them. A session today could not exercise three of the Player and
DM acceptance items, so it could not pass them. Implementing them is new feature work and
needs the owner's allocation; it is not done here.

## Blocker 2 — no participants or session conditions

No Player participant, DM participant, facilitator, observer, schedule, or recording
setup has been provided. The 30–45 minute target cannot be assessed without them.

## What was verified (engineering evidence, not usability evidence)

| Check                   | Result at `ccae57f`                                            |
| ----------------------- | -------------------------------------------------------------- |
| `pnpm validate`         | PASS (exit 0): format, lint, typecheck, context-budget, build  |
| `pnpm test`             | PASS, 161 files / 1,553 tests (includes integrity suites)      |
| `pnpm test:integration` | PASS, 20 files / 77 tests                                      |
| `pnpm test:e2e`         | PASS, 37 Chromium journeys (scripted; not a usability session) |

These show the implemented flows behave as designed; they say nothing about whether a
person finds Mira by interacting with world objects or hunts through the interface.

## Session protocol (ready to use once blockers are cleared)

- **Build and conditions to record:** exact revision and bundle hash above (or newer
  authorized revision), `pnpm build` then the browser-test or local server, dev persona
  tokens (ADR 0009; not production authentication), browser and screen size, scripted
  d20 vs live dice, AI provider (offline interpreter vs configured), date/time.
- **Roles:** one Player (new to the world, uncoached), one DM; facilitator speaks only to
  read the neutral prompt and may not hint; one observer logs; consent to record.
- **Neutral prompts:** Player — "You have just arrived in a town; explore it and do
  what seems natural." DM — "Run a short session: add a witness to your story, check
  what the players would see, and undo it if it is safe." No feature names.
- **Record, separating observation from interpretation:** for each acceptance step
  (table above) — reached unaided or after assistance (verbatim help given), time taken,
  whether the participant used world objects or searched menus, errors and dead ends,
  outcome (pass / pass with help / fail / not reachable), and quoted participant remarks.
  Defects need reproduction steps and the revision.
- **Integrity acceptance** (direct/indirect extraction of DM-only truth, Mira's limits,
  AI prose cannot kill Orin, invalid Counterspell, timeline-conflict warning, undo
  consistency) is covered by the existing integrity suites listed above; a human session
  may additionally probe it.

## Observation record (to be completed by the real session)

| Field                                  | Entry                     |
| -------------------------------------- | ------------------------- |
| Date, revision, bundle hash            | not run                   |
| Participants and roles                 | none                      |
| Task outcomes per acceptance step      | none                      |
| Assistance events                      | none                      |
| Object-first interaction vs UI hunting | none                      |
| Observed failures / defects            | none                      |
| Owner disposition of findings          | none — requires the owner |

## Decisions needed from the owner

1. Allocate the missing UI (Day 2 return and DM time advancement; Chronicle and minimal
   flashback; DM performance of Tomas) to a bounded remediation, with its model/effort
   per `EFFORT_MATRIX.md`, before any session. This is the planning decision the
   prerequisites document left open.
2. Provide the participants and the session conditions, or state that Stage 240 is
   deferred.
3. After a real session: record the disposition of every finding.

Stage 240 is **not** complete and Stage 250 must not start. Nothing in this report claims
a usability result.
