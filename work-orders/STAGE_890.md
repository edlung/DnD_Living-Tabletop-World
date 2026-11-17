# Work Order — Stage 890: "I'll come / I can't" for the next game

Authority: the owner's word of 2026-11-16 (`reviews/OWNER_TABLE_IDEAS_2026-11-16.json`, quoted as
relayed) and the standing word to follow a plan without asking, applied by the sessions' reading;
program `docs/TABLE_IDEAS_PLAN.md` (section 890, decision 13); ADR 0073 §10, written with the
stage. Branch `claude/stage-890-coming-answers`, stacked on Stage 880's. The last stage of the
program: its report carries the close.

This stage reverses decision 14 of `docs/MEMORY_RITUAL_PLAN.md` (a session's default, marked (S)
there), which left answers to the date outside the earlier package. The owner's new word asked
for the listed ideas, and the list included this one.

## Deliver

1. **Two buttons under the date** in a waiting player's lobby — "I'll come" and "I can't" — and
   what the table has answered.
2. **The DM's list** on the Session sheet, under the next game: each hero's answer, and the way
   to answer for someone who said it aloud.
3. **A changed date asks again.**

## Session's decisions (the owner asked not to be asked; each may be overruled)

- All of ADR 0073 §10.
- Two answers and none: no "maybe", no words to type.
- The same press again takes an answer back.
- The DM may answer for any hero, and so may overwrite a player's own answer; nothing records
  who pressed.
- Shown in the lobby and on the DM's Session sheet only — not in the list of campaigns, not on
  the table's screen, not in the calendar file.
- "I can't" does not mark a hero absent: that stays the DM's switch on the evening.
- An answer is the table's state about a hero, not a line of a person's copy of their data; the
  privacy notice names it.
- No reminder, no notification, no count of misses.

## Boundaries

Table data beside the world (migration 0048, additive): no event, no world state. No push
service, no e-mail, no AI. Nothing is deployed; merging is the owner's word.

## Checks

- Unit: who answers (own hero, the DM for anyone, nobody else) and who reads, per perspective;
  the changed date, the date taken away, no date; refused bodies; a character the party does
  not know is not revealed and cannot be probed; a display; the live signal.
- Integration: the PostgreSQL store against the in-memory one.
- Journey: `coming.spec.ts` (Chromium and the `ipad` project) — the player answers, the DM reads
  and answers for another, a new date asks again, the date's removal; in Russian.
- A look at the lobby and the Session sheet at 1440, 768, 390, 320 and 832×400 in both
  languages; an independent UX, copy and accessibility pass.
- Format, lint, typecheck, context budget, unit and integration tests, build, the whole e2e
  suite; an adversarial pass recorded in the report.

## Done

`reports/STAGE_890_COMPLETION.md`, status `AWAITING_OWNER_DISPOSITION`, with the program's
close: what is done, the merge order, what was not verified; a pull request stacked on Stage
880's.
