# Work Order — Stage 720: Stars and wishes

Authority: the owner's word of 2026-11-15, «не спрашивай меня, а действуй по плану до конца»
(`reviews/OWNER_MEMORY_RITUAL_2026-11-15.json`), program `docs/MEMORY_RITUAL_PLAN.md` (Part 1,
decisions 1, 10 and 12); ADR 0071 §2, written with the stage. Branch
`claude/stage-720-stars-and-wishes`, stacked on Stage 710's branch (PR 38, not merged): the
closing of an evening it builds on is there.

## Deliver

1. **A star and a wish** for each player and the DM at an evening's end: table data beside the
   world (migration 0040), one entry an author a session, written between sessions for the session
   that ended last, replaced when written again, removed when emptied.
2. **Who reads what** (the owner's answer): everyone at the table — a table display too — reads the
   stars; a wish is read by its author, in that character's perspective, and by the DM. A player
   writes for their own character, the DM for anyone at the table and for themself.
3. **The player's card** in the lobby while no session is open: whether theirs are written, the two
   fields on demand, each saying who reads it, and the table's stars so far.
4. **The DM's block** on the Session sheet between sessions: the last evening's stars and wishes,
   someone's words written for them, the stars cast to the table's screens, earlier evenings.
5. **The table's screen**: a `stars` cast — the prompt, then each star as it comes; the closing of
   an evening casts it. Online it opens every player's Table screen.
6. **Around it**: a campaign's move carries the table (ADR 0061), a person's copy of their data
   lists their stars and wishes and the privacy notice names them (ADR 0062), the live signal
   covers them.

## Session's decisions (the owner asked not to be asked; each may be overruled)

- "Unpair the table's screens" at a session's end is no longer ticked by default: the screens show
  the stars now and "Previously…" next time. Unpairing stays one tick away.
- The DM may write a star and a wish for any character at the table (a child who said them aloud)
  and their own; nobody else writes for another.
- 280 characters each; the last 20 ended sessions are listed.
- The glyph is the kit's `blessing`: the UI kit has no star, and art comes from the image model
  (the owner's rule), so a star glyph is a request for the art pipeline, not drawn here.

## Boundaries

No date of the next game (Stage 730), no agreement (740). Nothing canonical: no World Engine
decision reads a star or a wish. No AI call. No summary of wishes, no reactions, no ratings.
The migration is additive. Nothing is deployed; merging is the owner's word.

## Checks

- Store: the in-memory semantics and PostgreSQL held to them; the table's limits.
- HTTP: who reads and writes what — a player, the party's view, the DM, a table display, a
  stranger; the window between sessions; the live signal (a wish alone signals its author and the
  DM only).
- The move's coverage test; a person's copy of their data.
- Journeys: `stars-and-wishes.spec.ts` (Chromium, WebKit on an iPad), the TV in
  `evening-ritual-screens.spec.ts`.
- `ui-layout-audit` at 1440, 768, 390, 320 and 832×400, both languages, and the TV sizes; an
  independent UX pass.
- Format, lint, typecheck, context budget, unit and integration tests, build; an adversarial pass
  recorded in the report.

## Done

`reports/STAGE_720_COMPLETION.md`, status `AWAITING_OWNER_DISPOSITION`, a pull request stacked on
Stage 710's.
