# Stage 220 — Combat UX

- Date: 2026-10-05 (Europe/Oslo).
- Status: **COMPLETE**. Stage 230 is not authorized or started.
- Work order: `work-orders/OPUS_STAGE_220.md`.
- Starting revision: `d8aa05d` (Stage 210 committed).
- Model exception: the owner told this session (Claude Sonnet 5.5) to proceed
  instead of Opus 5.5/HIGH. Later model/gate requirements are unchanged.
- Technical decision: `docs/adr/0028-combat-ux.md`. Three UX choices were put to
  the owner and taken as recommended: click-a-square movement, an ephemeral DM
  panel, highlighted squares plus a list for area spells.

## Delivered

- Persistent battlefield (`apps/web/src/combat/`): published squares, difficult
  terrain, cover levels, tokens, turn marker; a minimal anchor strip (round, turn,
  own HP, End turn only on the player's turn). No permanent action bar.
- Ephemeral options from the Context Engine for a chosen combatant: longbow
  attack, Fireball, Counterspell, Healing Word, Hunter's Mark, with legality
  reasons, slot cost, distance, required movement, and long-range notes.
- Movement by clicking a square: an advisory cheapest route is submitted as the
  existing `MoveCombatant`; the server's refusal (for example not enough
  movement) is shown.
- Fireball preview: affected combatants listed and marked on the grid, a visible
  ally warning (`ALLY_IN_AREA`), and the cast stays available.
- Reaction prompt for the asked character: Counterspell (cost shown) or Ignore.
  Stale, duplicate, and expired answers are refused by the domain; the client
  spends nothing locally.
- DM operations through existing commands: start an encounter from the scene,
  end it, close a reaction window, run the server's suggested monster turn.
- No server, rules, combat, reaction, or contract code changed.

## Validation gate

| Gate item                                            | Evidence                                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Attack and movement                                  | `combat-turn.spec.ts` (move, longbow hit/miss, over-speed move refused 422)                                  |
| AoE and ally warning                                 | `combat-area.spec.ts` (warning when in area, none when away; legal cast spends 1 slot)                       |
| Valid Counterspell                                   | `combat-reactions.spec.ts` (accepted, one slot spent, window closed)                                         |
| IGNORE / expiry                                      | Ignore spends no slot; DM-closed window emits `ReactionWindowExpired`                                        |
| Stale and duplicate reactions, no duplicate resource | stale click refused `REACTION_WINDOW_CLOSED`; same command ID is `duplicate`; repeat refused; slots +1 total |
| Leaving the encounter                                | `combat-lifecycle.spec.ts` (DM start, suggested turn, End encounter; players regain exploration)             |
| Deterministic rules and reaction suites unchanged    | full `pnpm test` / `pnpm test:integration` pass with no edits to those packages                              |

## Commands (final tree)

| Check                   | Result                                                 |
| ----------------------- | ------------------------------------------------------ |
| `pnpm validate`         | PASS (exit 0): format, lint, typecheck, context-budget |
| `pnpm test`             | PASS, 160 files / 1,551 tests                          |
| `pnpm test:integration` | PASS, 20 files / 77 tests                              |
| `pnpm test:e2e`         | PASS, 31 Chromium journeys                             |
| context-budget          | 551 active files; zero over 500 or 700 lines           |

Bundle: `assets/index-C4JpPZTs.js` SHA-256
`f2fff69caaf64c40e3799439eefce52ef54d2fc5afd2ea2ba1d8d0410c3cfe64`;
`assets/index-D3wNtKLZ.css` SHA-256
`77b463e5d3b054cb79764a81dce0fd17a0bbe742235954a99b96b7aed8a7acc6`.

## Limitations

Scripted d20 results of 15, no live AI runs, and no live event subscription (the
view refreshes after each action or explicitly); a second player's screen can be
stale until refreshed, which the domain tolerates by refusing stale answers.
Opportunity attacks and timed expiry are not implemented (ADR 0016). DM starts
encounters on open ground; terrain authoring is Stage 230. Movement routes are
advisory. Misty Step has no context action, so it is not offered. Narrow-screen
layout of the 16-column grid was not manually reviewed. Hosted CI was not run
remotely.

Stage 220 is complete. Stop here; Stage 230 requires explicit owner authorization.
