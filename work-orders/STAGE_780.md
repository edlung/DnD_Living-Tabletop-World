# Work Order — Stage 780: The home between worlds

Authority: the owner's word of 2026-11-16, «продолжаем», and the word of 2026-11-15 to follow the
plan without asking (`reviews/OWNER_MEMORY_RITUAL_2026-11-15.json`); the answer that the home
between worlds joins the package; program `docs/MEMORY_RITUAL_PLAN.md` (Part 2, decision 12); ADR
0072 §2, written with the stage. Branch `claude/stage-780-home-between-worlds`, stacked on Stage
770's branch (PR 43, not merged).

The plan called this stage its largest unknown and wanted its design drafted after a campaign had
been played to its end. None has been: the design is the session's draft, marked as such in the
ADR and the report.

## Deliver

1. **A campaign's end**: the DM finishes a campaign between sessions, with last words, and may
   reopen it; table data (migration 0043, additive).
2. **Read, not played**: a guard refuses every change to a finished campaign but the few its end
   still takes, named in one list.
3. **Keepsakes**: each hero keeps one thing they carry or one chapter of the party's story, with
   a line — the player's choice, or the DM's for someone without a screen.
4. **Where it shows**: the lobby of a finished campaign, the DM's Session sheet, the book's last
   page ("What the heroes keep", the DM's words, "The end").
5. **The home between worlds**: "Adventures we finished" in the account's list — the days
   played, the heroes, the keepsakes, the book first.
6. A person's copy of their data and the notice name keepsakes; the tables move with a campaign;
   the live signal covers the new read.

## Session's decisions (the owner asked not to be asked; each may be overruled)

- All of ADR 0072 §2: the end is table data and reversible; what a finished campaign still takes;
  one keepsake a hero, a thing carried or a party chapter, named by the server; everyone reads
  them; no picture in the account's list.
- Keepsakes are chosen only once the campaign is finished; a reopening keeps them.
- The controls of play stay on a finished campaign's screens and are refused (as on an away
  campaign's): the lobby says the adventure is read now.

## Boundaries

No event and no world state for the end. No AI. No keepsake that is a free text, a photograph or
an upload. No pictures in the account's list. No cast of the end on the table's screen. The
migration is additive. Nothing is deployed; merging is the owner's word.

## Checks

- HTTP: who finishes and reopens, who chooses for whom, what may be kept, a table display, the
  guard and its list; PostgreSQL held to the in-memory semantics; the move's coverage, the live
  inventory, the account's list and a person's copy.
- Journeys: `campaign-end.spec.ts` (Chromium, WebKit on an iPad), `campaign-end-hub.spec.ts`.
- `ui-layout-audit` at 1440, 768, 390, 320 and 832×400 in both languages; an independent UX, copy
  and accessibility pass.
- Format, lint, typecheck, context budget, unit and integration tests, build, the whole e2e suite;
  an adversarial pass recorded in the report.

## Done

`reports/STAGE_780_COMPLETION.md`, status `AWAITING_OWNER_DISPOSITION`, a pull request stacked on
Stage 770's.
