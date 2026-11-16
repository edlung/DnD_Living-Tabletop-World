# Work Order — Stage 830: The party's encyclopedia

Authority: the owner's word of 2026-11-16 (`reviews/OWNER_TABLE_IDEAS_2026-11-16.json`, quoted as
relayed) and the standing word to follow a plan without asking, applied by the sessions' reading;
program `docs/TABLE_IDEAS_PLAN.md` (section 830); ADR 0073 §4, written with the stage. Branch
`claude/stage-830-party-encyclopedia`, stacked on Stage 820's.

## Deliver

1. **"What we know"** in the Chronicle, beside "By chapter" and "The whole book": people and
   creatures, places, things and factions, each with what the party knows of it and the party's
   chapters that tell of it; what else the party has learned; what it set out to do.
2. **Read as the party, whoever opens it**: a player and the DM read the same page.
3. **A field to find a name**; a chapter opens from an entry.

## Session's decisions (the owner asked not to be asked; each may be overruled)

- All of ADR 0073 §4.
- It is a view of the Chronicle, not a sheet of the dock (the dock is full on a phone) and not
  part of the printed book.
- The list of campaigns gets no second button: "The book" there opens the Chronicle, where "What
  we know" is one press away.
- The heroes are not entries: the page is about what the party met.
- A record's type is shown only where it is not a plain fact.
- Pictures are as the party sees them now, not at a chapter's time: the page is the party's
  knowledge today.
- No memories are listed: the party's chapters are its told story, and each entry names them.

## Boundaries

No server change, no contract change, no migration, no table. Read only. No AI. No art drawn or
generated. Nothing is deployed; merging is the owner's word.

## Checks

- Unit: the page's assembly — the sections by kind and name; each entry's records with their
  types; the party's chapters named once and no other perspective's; no name from a chapter or a
  record the directory does not list; a secret left out; quests; the empty page; finding a name.
- Journey: `party-known.spec.ts` (Chromium, WebKit on an iPad): a player's page; the search; the
  DM's page — the same names, and neither the page nor what it was sent holds a marker forbidden
  to the party; a chapter opened from an entry; in Russian.
- A look at the new screen at 1440, 768, 390, 320 and 832×400 in both languages; an independent
  UX, copy and accessibility pass.
- Format, lint, typecheck, context budget, unit and integration tests, build, the whole e2e
  suite; an adversarial pass recorded in the report.

## Done

`reports/STAGE_830_COMPLETION.md`, status `AWAITING_OWNER_DISPOSITION`, a pull request stacked on
Stage 820's.
