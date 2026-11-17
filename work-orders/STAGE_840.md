# Work Order — Stage 840: Players' private notes and a hero's backstory

Authority: the owner's word of 2026-11-16 (`reviews/OWNER_TABLE_IDEAS_2026-11-16.json`, quoted as
relayed) and the standing word to follow a plan without asking, applied by the sessions' reading;
program `docs/TABLE_IDEAS_PLAN.md` (section 840, decision 8); ADR 0073 §5, written with the
stage. Planned in Stage 630 and never built. Branch `claude/stage-840-notes-and-backstory`,
stacked on Stage 830's.

## Deliver

1. **A hero's backstory**: one text a character, read and written by its own player and the DM.
2. **A player's private notes**: read and written by the person who wrote them and nobody else,
   the DM included.
3. **The Story tab** of the character's sheet for both, each part saying first who reads it.
4. **Around them**: the tables move with the campaign; a person's copy lists them; deleting an
   account deletes its private notes; the privacy notice names both.

## Session's decisions (the owner asked not to be asked; each may be overruled)

- All of ADR 0073 §5.
- A note is kept under its writer's actor in the campaign, not under the character alone: whoever
  takes the seat later does not inherit a stranger's notebook.
- The DM may take a character's view and still never reads its player's notes; the DM's own
  notes stay where they were (ADR 0043 §5).
- A note is deleted for good, at once; there is no bin.
- Neither is in the live inventory.
- A finished campaign still takes a private note and no longer a backstory.
- The plan said the DM reads backstories "from the party's sheet": the DM opens a hero's sheet
  from there and finds the Story tab; there is no second list.

- From the independent pass, taken as decisions: the sheet asks before it closes on unsaved
  words, and the Story tab keeps them while another tab shows; a backstory's field follows what
  is kept until someone types, and says when it changed under the typing; the DM's tab says
  that a player's notes exist and are not the DM's to read; "Backstory" is «История героя» in
  Russian (the builder's Background is «Предыстория»).
- Found by looking at the screens: five tabs share a phone's row by their words.

## Boundaries

No world state, no event, no command, no knowledge record. No AI reads either text. No art.
Additive migration (0045). Nothing is deployed; merging is the owner's word.

## Checks

- Unit: the routes per role — the hero's player, another hero's player, the party's and the
  public view, the DM in the DM's view and in the character's, a stranger, nobody, a table
  display; bounds; the notebook's size; the rate; the finished guard; no entry in the live
  inventory; the account's copy and its deletion.
- Integration: the stores on PostgreSQL against the in-memory ones; the move's coverage.
- Journeys: `hero-story.spec.ts` (Chromium, WebKit on an iPad) with the DM and two players — a
  backstory and a note written and kept through a reload; the DM's tab and what the DM was sent;
  the other player's tab and what they were sent; the DM writes for a child; a note deleted;
  `hero-story-words.spec.ts` in Russian.
- A look at the new screens at 1440, 768, 390, 320 and 832×400 in both languages; an independent
  UX, copy and accessibility pass.
- Format, lint, typecheck, context budget, unit and integration tests, build, the whole e2e
  suite; an adversarial pass recorded in the report.

## Done

`reports/STAGE_840_COMPLETION.md`, status `AWAITING_OWNER_DISPOSITION`, a pull request stacked on
Stage 830's.
