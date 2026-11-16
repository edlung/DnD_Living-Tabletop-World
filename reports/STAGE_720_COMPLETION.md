# Stage 720 completion — stars and wishes

Work order `work-orders/STAGE_720.md`; program `docs/MEMORY_RITUAL_PLAN.md` (Part 1, decisions 1, 10
and 12); the owner's word of 2026-11-15, «не спрашивай меня, а действуй по плану до конца»
(`reviews/OWNER_MEMORY_RITUAL_2026-11-15.json`); ADR 0071 §2; 2026-11-15. Status:
**AWAITING_OWNER_DISPOSITION**. Branch `claude/stage-720-stars-and-wishes`, stacked on Stage 710's
(PR 38, not merged). Session model: Claude Fable 5.2.

## What changed

- **A star and a wish.** When the DM ends a session each player may name a star — what they liked —
  and a wish — what they want next time; the DM too. Table data beside the world (migration 0040):
  one entry an author a session, 280 characters each, written between sessions for the session
  that ended last, replaced when written again, removed when emptied. No World Engine decision
  reads them.
- **Who reads what** (the owner's answer). Everyone at the table and the table's screen read the
  stars. A wish is read by its author, in that character's perspective, and by the DM: no other
  view lists it — not the party's shared view the same player may take — and it signals nobody
  else.
- **The player's card** in the lobby while no session is open: the question, the two fields on
  demand with who reads each said before the field, what was kept in the player's own words, and
  everyone's stars so far. The recap beside it steps aside while a player writes.
- **The DM's block** on the Session sheet between sessions: the last evening's stars; its wishes
  folded until asked for (the sheet may lie open at the table); a form to write for someone who
  said theirs aloud, which holds what that person already kept so that writing a star never wipes
  a wish; the stars cast to the table's screens; earlier evenings.
- **The table's screen**: a `stars` cast — the prompt and how to answer, then each star as it comes
  (two columns above four). Closing an evening casts it; online it opens every player's Table
  screen.
- **Around it.** A campaign's move carries the table; a person's copy of their data lists their own
  stars and wishes; the privacy notice names them and who reads each, in both languages.
- **Session's decisions** (the owner asked not to be asked; each may be overruled): "Unpair the
  table's screens" at a session's end is no longer ticked by default, so the screens show the stars
  now and "Previously…" next time; the DM may write for any character at the table; the card's
  glyph is the kit's `blessing`, since the kit has no star and art is the image model's.

## Found and fixed on the way

- **A star signalled nobody on a server without a database.** The application and its live twin
  each made their own in-memory store, so the twin's fingerprint never saw a write: the DM's sheet
  and the TV learned of a star only by a chance re-read. `live/live-app.ts` now shares one store,
  as it does for chat and handouts; `reflection-live.test.ts` holds it. Production, on PostgreSQL,
  was not affected. The layout audit's long pauses exposed it; the first journey had passed.
- **The DM's form could erase a child's private wish** (found by the independent UX pass before it
  shipped): writing a star for someone replaced their whole entry. The form now starts from what
  that person kept and says whose words are being changed; the journey proves a wish survives.

## Files

Contracts `session/reflections.ts`, `display/display.ts` (`stars`), `session/accounts.ts`. Server
`src/reflections/` (`reflection-routes.ts`, `reflection-store.ts`, `postgres-reflection-store.ts`),
migration `0040_session_reflections.sql`, `http/app.ts`, `main.ts`, `live/inventory.ts`,
`live/live-app.ts`, `campaigns/move/tables.ts`, `accounts/privacy.ts`. Client `ritual/`
(`reflections.ts`, `stars-card.tsx`, `evening-words.tsx`, `stars-cast.tsx`, `stars-list.tsx`),
`dm/close-evening.tsx`, `dm/evening.ts`, `dm/session-sheet.tsx`, `dm/cast-form.tsx`,
`session/lobby-banner.tsx`, `display/cast-views.tsx`, `online/shared-screen.tsx`,
`session/privacy-notice.tsx`, `styles/stars.css`, `i18n/ru-ritual.ts`, `i18n/ru-privacy.ts`.

## Verification

Run on the branch on 2026-11-15 (offline; no paid call):

| Check                                                         | Result                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm run format:check`, `lint`, `typecheck`                  | pass                                                                                                                                             |
| `pnpm run context-budget`                                     | pass; one earlier warning (`scripts/campaign-shared/combat-kit.ts`), none from this stage                                                        |
| `pnpm run test` (unit)                                        | 570 files, 4593 tests pass                                                                                                                       |
| `pnpm run build`                                              | pass                                                                                                                                             |
| `pnpm run test:integration` (PostgreSQL, throwaway databases) | 79 files, 394 tests pass: the store held to the in-memory semantics, migration 0040, the move's coverage                                         |
| `pnpm run test:e2e` (the whole suite)                         | 339 pass, 2 fail: `toolbox.spec.ts:23` (passed when run again alone: a timeout under the full run's load) and `voice.spec.ts:77` (see below)     |
| `ui-layout-audit` (`audit.mjs` in a temporary journey)        | no finding from this stage at 1440, 768, 390, 320 and 832×400 in both languages, nor on the TV at 960×540, 1920×1080 and 4K; two reviewed, below |

The stage's journeys: `stars-and-wishes.spec.ts` (Chromium on a laptop, WebKit on an iPad) and the
TV's part of `evening-ritual-screens.spec.ts`.

An independent UX pass (a fresh agent: task walkthroughs for a child on a phone, the DM at the
table and a shy player; copy in both languages; accessibility) found two blockers and ten more
points before the stage was shown; all twelve were taken, and the journeys and the audit were run
again after them.

## Adversarial pass (invariants 1–5, 11)

- Another player's wish: not in the player's own view, not in the party's view, not in what the
  player's browser received across the journey, not on the screen; a wish alone is not listed and
  does not signal the player's live stream (`reflection-routes.test.ts`,
  `reflection-live.test.ts`, `stars-and-wishes.spec.ts`).
- A table display: stars only, 403 for the DM's view, no write
  (`reflection-routes.test.ts`); nothing the TV received in the journey holds a wish.
- Writing as someone else: a player for another character, as the DM, through the party's view or
  the DM's perspective — 403; a stranger — 404; the DM for an NPC, for another session, over the
  length — 422, 422, 400.
- The window: nothing is written while a session plays or after the next one starts; the entries
  stay readable.
- A person's copy holds their own stars and wishes and never the DM's or another's
  (`privacy.test.ts`); the move's coverage test names the table.
- Looked for and left as designed: a star is free text the whole table reads, like table talk — the
  card says so before the field; the DM can read and change anyone's words.

## Not verified, and limits

- `tests/e2e/voice.spec.ts:77` fails on this machine as in Stage 710 (WebRTC stays "connecting");
  the stage touches nothing of voice. The pull request's CI decides.
- The audit's two reviewed findings: while a player writes on a wide, short screen (832×400) the
  card covers the place's name, on purpose — both fields, who reads each and the buttons fit above
  the dock that way; and the heuristic `row-content-misaligned` names the Session sheet's Music
  panel, whose words are shorter than the new blocks beside it (not changed by this stage).
- Not tried: a phone's on-screen keyboard over the card, a screen reader's actual speech, six
  stars of full length on a real TV (the cast has two columns above four and no scrolling).
- `pnpm run db:migrate` was run only inside the integration tests' throwaway databases, never on
  the shared development database; nothing was run on a deployment, in the native apps or on a
  real TV. No human has played it.
- A deleted account's stars and wishes stay with the campaign under the character's name, as table
  talk does (ADR 0062): decided by analogy, not asked.

## For the owner

- The default "Unpair the table's screens" changed from ticked to unticked (above). Say so if the
  old default should come back.
- A star glyph for the card would come from the art pipeline; the card uses `blessing` meanwhile.
- Play acceptance is the owner's: end an evening, write a star and a wish on a phone, read them
  on the DM's screen and the TV.
