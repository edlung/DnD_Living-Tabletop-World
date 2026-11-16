# Work Order — Stage 740: The table's agreement and the DM's guide

Authority: the owner's word of 2026-11-15, «не спрашивай меня, а действуй по плану до конца», and
the answer that the agreement and the DM's guide join the package
(`reviews/OWNER_MEMORY_RITUAL_2026-11-15.json`); program `docs/MEMORY_RITUAL_PLAN.md` (Part 1);
ADR 0071 §4, written with the stage. Branch `claude/stage-740-agreement`, stacked on Stage 730's
branch (PR 40, not merged).

## Deliver

1. **The agreement**: one page a campaign — tone, "not in this game", the sign for a pause, who
   plays — table data beside the world (migration 0042, additive). The DM writes it from a family
   table's start; every member and a table display read it.
2. **"Understood"**: said to a version, by a player for their own character or by the DM for
   someone who said it aloud; changed words ask again; the DM alone reads who has said it.
3. **Where a player meets it**: a card until they have said it; the page for good in "How to
   play" ("Our table"), with "Ask for a pause" (fixed words, to the DM alone) and "Tell the DM
   privately" (the chat with the DM chosen).
4. **The table's screen**: an `agreement` cast for the first meeting.
5. **The DM's guide**: "How to run the game", seven pages, beside the players' pages; the guide
   opens by role.
6. **Before the first evening**: the DM's short list on the Session sheet until a first session
   has ended.

## Session's decisions (the owner asked not to be asked; each may be overruled)

- The eight things to tick and the four tones, and the family start (adventurous; no detailed
  blood, cruelty to animals, harm to children, torture, swearing).
- The card shows over a game in play too, with "Later": a campaign may begin with its first
  session open, so "between sessions only" would hide it before the first evening.
- "Ask for a pause" is a whisper to the DM with fixed words; it does not pause the game by itself.
- A library campaign's `audience` and `tone` do not start the page off (a campaign does not record
  its library entry).
- The marks of "Understood" are not in a person's copy of their data.
- The owner's open point stays open: whether "not in this game" binds AI prose and NPC talk.

## Boundaries

No AI call and no prompt change. No lines-and-veils taxonomy beyond the eight ticks and free
lines; no anonymous reports; no automatic pause. Nothing canonical. The migration is additive.
Nothing is deployed; merging is the owner's word.

## Checks

- HTTP: who reads and writes, a table display, versions, a page out of shape; PostgreSQL held to
  the in-memory semantics; the live inventory and the move's coverage.
- Journeys: `agreement.spec.ts` (Chromium, WebKit on an iPad), `agreement-screens.spec.ts` (the
  TV; a campaign started anew and its first-evening list).
- `ui-layout-audit` at 1440, 768, 390, 320 and 832×400, both languages, and the TV sizes; an
  independent UX and copy pass in both languages.
- Format, lint, typecheck, context budget, unit and integration tests, build, the whole e2e suite;
  an adversarial pass recorded in the report.

## Done

`reports/STAGE_740_COMPLETION.md`, status `AWAITING_OWNER_DISPOSITION`, a pull request stacked on
Stage 730's.
