# Work Order — Stage 880: Sealed envelopes

Authority: the owner's word of 2026-11-16 (`reviews/OWNER_TABLE_IDEAS_2026-11-16.json`, quoted as
relayed) and the standing word to follow a plan without asking, applied by the sessions' reading;
program `docs/TABLE_IDEAS_PLAN.md` (section 880, decision 12); ADR 0073 §9, written with the
stage. Branch `claude/stage-880-sealed-envelopes`, stacked on Stage 870's.

## Deliver

1. **"Seal in an envelope"** on a handout kept in the DM's library: words for the outside, and
   what opens it — the DM's word, or the writing of the evening's chapter.
2. **The DM's list of envelopes** in the Party sheet: the outside, what is inside, what opens
   it; "Open it now" and "Delete".
3. **The party's view** in the Journal: each sealed envelope from outside. Opened, it arrives as
   a handout does.
4. **The chapter opens it**: a chapter told from the party, written for the evening the envelope
   names, opens it in the same request.

## Session's decisions (the owner asked not to be asked; each may be overruled)

- All of ADR 0073 §9.
- An envelope is for the party. One for a single character is a handout given to them.
- "A named chapter" is the chapter of an evening: the session open at the sealing, or — sealed
  between evenings — the next evening's. The DM names nothing by hand.
- An evening that ends with no chapter leaves its envelopes sealed, for the DM's word.
- An envelope whose picture the party does not know yet does not open, and says why to the DM.
- No cast: the table's screen shows no envelope by itself.
- Fifty envelopes a campaign, 120 characters on the outside.
- The glyph is the UI kit's `secret`; nothing is drawn.

## Boundaries

Table data beside the world (migration 0047, additive): no event, no world state, no knowledge
change. The inside is in no answer below the DM until it opens. No AI. Nothing is deployed;
merging is the owner's word.

## Checks

- Unit: the party's read holds the outside only, for a player, the party's view, the DM on that
  route and a display; opening gives one handout however often asked; the copy taken at sealing
  survives the library's entry; the party's chapter of the evening opens it and no other chapter
  does; an unknown picture keeps it sealed; roles and strangers; the live signal.
- Integration: the PostgreSQL store against the in-memory one; the table's constraints.
- Journey: `envelopes.spec.ts` (Chromium and the `ipad` project) — sealing, the Journal, what
  the player's page was sent, opening, deleting; the chapter of the evening; in Russian.
- A look at the form, the DM's list and the Journal at 1440, 768, 390, 320 and 832×400 in both
  languages; an independent UX, copy and accessibility pass.
- Format, lint, typecheck, context budget, unit and integration tests, build, the whole e2e
  suite; an adversarial pass recorded in the report.

## Done

`reports/STAGE_880_COMPLETION.md`, status `AWAITING_OWNER_DISPOSITION`, with the third
checkpoint (Stages 860–880); a pull request stacked on Stage 870's.
