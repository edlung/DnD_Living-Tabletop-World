# Work Order — Stage 860: A shorter way in for a guest

Authority: the owner's word of 2026-11-16 (`reviews/OWNER_TABLE_IDEAS_2026-11-16.json`, quoted as
relayed) and the standing word to follow a plan without asking, applied by the sessions' reading;
program `docs/TABLE_IDEAS_PLAN.md` (section 860, decision 10); ADR 0073 §7, written with the
stage. Branch `claude/stage-860-guest-way-in`, stacked on Stage 850's.

## Deliver

1. **One press on a hero sits a guest down**: the table's join page redeems the chosen seat in
   this browser at once; no second page, no login to invent.
2. **"I want a login"** under the heroes, for who wants to come back from another device: the
   usual join page then.
3. **The screen's words** say what the way now is.

## Session's decisions (the owner asked not to be asked; each may be overruled)

- All of ADR 0073 §7.
- The walk that was read in code: scan → "Join the table" (reads itself) → "Choose your
  character" → "You are invited to a table" with a new login as its first choice → "Take your
  seat" → the page loads again. Removed: the second page and its three fields, for a guest.
- Kept: the page loading again after the seat is taken (nobody presses anything for it); the
  agreement's card and "I am ready" in the game (neither blocks play).
- The typed-code way (`/table`, eight letters) keeps its one field: a guest without a camera.
- No server change: the seat's invitation and "only this browser" exist; the page uses them.

## Boundaries

No server change, no contract change, no migration. The join link's limits and hours are not
touched. No AI. No art. Nothing is deployed; merging is the owner's word.

## Checks

- Journeys: `table-display.spec.ts` — the scan, one press, the game, with no login field ever
  shown; the typed code with "I want a login" and the usual join page; the DM's list of seats
  taken. The other sign-in journeys (invitation links, accounts, the hub) unchanged and green.
- A look at the changed screen at 1440, 768, 390, 320 and 832×400 in both languages; an
  independent UX, copy and accessibility pass.
- Format, lint, typecheck, context budget, unit and integration tests, build, the whole e2e
  suite; an adversarial pass recorded in the report.

## Done

`reports/STAGE_860_COMPLETION.md`, status `AWAITING_OWNER_DISPOSITION`, a pull request stacked on
Stage 850's.
