# 0028. Combat UX: persistent battlefield, ephemeral options

- Status: Accepted
- Date: 2026-10-05
- Stage: 220 only
- Decision type: technical; the three UX choices below were put to the owner and
  taken as recommended (movement by clicking a square, an ephemeral DM panel,
  highlighted squares plus a list for areas).
- Owner approval: the owner authorized Stage 220 and directed this session
  (Claude Sonnet 5.5) to carry it out instead of Opus 5.5/HIGH. The exception
  does not change the matrix for later stages or independent gates.

## Context

The combat, reaction, context, and encounter contracts already exist (ADRs
0015, 0016, 0012). Stage 220 presents them; it adds no rule, route, or contract.
The Rules Engine and World Engine stay the only authority on legality, cost,
turn order, and reaction windows.

## Decisions

1. **Persistent battlefield, minimal anchor.** `apps/web/src/combat/` draws the
   published `EncounterView` as a square grid with difficult terrain, cover,
   tokens, and the turn marker. The anchor strip shows only round, whose turn it
   is, the player's own HP, and **End turn on the player's own turn**. There is no
   permanent action bar.
2. **Ephemeral options.** Selecting a combatant opens its options from the
   Context Engine (`entities/:id/context`): longbow attack, Fireball centered on
   that combatant, Counterspell, Healing Word, Hunter's Mark, each with the
   server's legality reason, cost, distance, `moveRequiredFt`, and `LONG_RANGE`.
   Selecting an empty square opens "Move here". Every resolved action discards
   the options (the panel is keyed by the world revision).
3. **Area preview.** Fireball's affected combatants come from `ContextAction.area`;
   the grid marks exactly those combatants' squares and the options list them.
   `ALLY_IN_AREA` becomes a visible warning and never disables the button, so a
   legal suboptimal cast stays possible. The client never computes a radius.
4. **Movement.** The client composes a cheapest route (`movement.ts`) from the
   published bounds, living combatants, and difficult squares, then submits the
   existing `MoveCombatant`. The displayed feet are labelled advisory; speed,
   path validity, and action economy are decided by the server, whose refusal
   (`ILLEGAL_ACTION` with a rules reason such as `NOT_ENOUGH_MOVEMENT`) is shown.
5. **Reactions.** A candidate whose window offers choices gets an ephemeral
   "Reaction" prompt: Counterspell (if the Context Engine lists it as legal, with
   its slot cost) or Ignore (`DeclineReaction`). Stale, duplicate, and expired
   answers are refused by the domain (`REACTION_WINDOW_CLOSED`, `ALREADY_RESPONDED`)
   and the view refreshes; the client spends nothing locally. Existing untimed
   expiry semantics stand: only the DM's `CloseReactionWindow` expires a window.
6. **DM operations** (existing commands only): start an encounter on open ground
   from the characters and creatures present (party left, others right,
   initiative rolled by the rules), end it (`EndCombat`), close an open reaction
   window, and run the exact command of the server's monster-turn suggestion.
   Terrain authoring is deferred to Stage 230. After `EndCombat` the encounter
   view is null and exploration options work again.
7. **Acting rights.** The action hook now accepts commands for a DM session as
   well as the player's own character; the server still authorizes every command.
   Entity-detail (exploration) options stay disabled while an encounter runs.

## Test isolation

Each mutating combat journey owns a campaign cloned from the authorized
Ravenford script and advanced by real DM commands
(`apps/server/src/testing/ui-combat-campaigns.ts`, `tests/e2e/fixtures/combat-campaigns.json`).
Scripted d20 results of 15; no external AI provider.

## Consequences

No dependency edge, contract, canonical mutation path, or reviewed projection
changed, so no gate is reopened. Opportunity attacks, timed expiry, terrain
authoring, and live event subscription remain out of scope.
