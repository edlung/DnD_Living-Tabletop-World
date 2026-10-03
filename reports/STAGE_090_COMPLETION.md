# Stage 90 Completion Report — Reaction Engine

- Work order: `work-orders/OPUS_STAGE_090.md`
- Builder: Claude Opus 5.5 (matrix: MAX)
- Implementation revision: `429e2a273ef17a304c09d62965cc60b6cf3be7ad` (branch `main`)
- Formal gate: **Astra Gate 03 — Reaction Integrity**. Handoff: `handoffs/ASTRA_GATE_03_REQUEST.md`.
- Status: **AWAITING_ASTRA_REVIEW**. Stage 100 is not authorized until Gate 03 passes.

## Decisions

| ADR                                                                                                                                                    | Decision                                                                                                                                                                                                                 | Approval                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0016](../docs/adr/0016-reaction-engine.md)                                                                                                            | Canonical reaction windows; suspend and pause; Counterspell eligibility, answers, and resolution; DM close as expiry; serialization; undo and rewind with an open window; visibility; combatants stay on the battlefield | Approved as written by the owner on 2026-10-04, before implementation. Owner choices: opportunity attacks deferred; expiry only by the DM's (or the system's) close; a candidate sees the caster and components, not the spell's identity or target |
| Amendments: [0006](../docs/adr/0006-temporal-model-and-undo.md), [0012](../docs/adr/0012-context-engine.md), [0015](../docs/adr/0015-combat-engine.md) | §9 reaction obligation fulfilled; context in a window; Counterspell via windows, opportunity attacks deferred, no leaving the battlefield, no probing for fights                                                         | Follow from ADR 0016                                                                                                                                                                                                                                |

**Disclosed post-approval details** (ADR 0016, "Implementation notes"). They only tighten the approved text:

- A character outside the encounter cannot probe for a fight. Its combat commands answer `NOT_IN_COMBAT`, with the same message as when no encounter runs, and its window answers get `REACTION_WINDOW_CLOSED`.
- The Context Engine lists `counterspell` first among a creature's actions.

## Delivered

- **Reaction windows.**
  - A legal cast in combat that someone could counter is suspended: the caster's action (or Bonus Action) is spent and `ReactionWindowOpened` records the window.
  - The window records its trigger, candidates in initiative order, every other combatant with the Rules' reason it was not eligible, and the commands that opened and closed it.
  - Windows are canonical state kept by ID; at most one is open.
- **Eligibility** comes from the Rules (`checkCounterspell`): a character other than the caster, alive and not Incapacitated, who knows Counterspell, has its Reaction and a slot of level 3+ (one slot per turn), and stands within 60 ft of a caster who is not in total cover.
- **Answers:**
  - `UseReaction` spends the Reaction and the slot; the caster then makes a Constitution save against the reactor's DC. On a failure the spell is countered (no effect, no slot spent); on a success the window stays open for the other candidates.
  - `DeclineReaction` (Ignore).
  - `CloseReactionWindow` (DM or system) expires whoever has not answered.
  - When nobody is pending, the suspended cast resolves in that same command, against the state after the answers and with that command's recorded dice.
- **Pause rule** (kernel, central). While a window is open:
  - every other combat command from a combatant gets `REACTION_PENDING`;
  - any command is refused if it would change a fact the window's opening read: the encounter, the clock, or any combatant's existence, status, location, sheet, or stat block;
  - undo keeps its footprint rule.
- **Combat integrity** (amends ADR 0015):
  - combatants cannot leave the battlefield (`EnterLocation` and `PlaceEntity` are rejected);
  - every placement depends on the encounter for undo;
  - the integrity checks now cover encounters and windows.
- **Context:** combat actions are `REACTION_PENDING` during a window; a pending candidate sees `counterspell` on the caster.
- **Encounter view:** `reactionWindow` per perspective.
- **Player outcomes:** `UseReaction { countered }`, `DeclineReaction`, and a suspended `CastSpell { awaitingReaction }`.

## Validation gate evidence — "Eligibility, expiry, resolution, double-spend, concurrent responses, ordering/replay, and declared undo/rewind behavior with an open window pass"

| Item                        | Evidence                                                                                                                                                                                                                                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Eligibility                 | `packages/combat/src/reactions/eligibility.test.ts`: out of range, no slot of level 3+, total cover, Unconscious, spent Reaction (and regained at the start of the reactor's turn), two candidates in initiative order, the dead not eligible                                                                    |
| Expiry                      | `reactions/integrity.test.ts`: the DM closes the window, unanswered candidates expire, the spell proceeds, a player cannot close, and a late answer or second close is refused; PostgreSQL: a stored close replays and re-decides                                                                                |
| Resolution                  | `reactions/lifecycle.test.ts`: countered on a failed save (no effect; slot and Reaction spent), proceeds on a successful save in the same command, Ignore, an invalid Counterspell rejected by the Rules (`SLOT_TOO_LOW`, `NO_VALID_TRIGGER`)                                                                    |
| Double-spend                | `reactions/integrity.test.ts`: `ALREADY_RESPONDED`, `REACTION_WINDOW_CLOSED`, an idempotent retry acting once, slots spent once; two candidates (a failed Counterspell then a counter; first success expires the rest)                                                                                           |
| Concurrent responses        | `reactions/concurrency.test.ts` (rival engine on the same store; forced races in both orders; same candidate twice; two candidates; bursts), and PostgreSQL `reaction.integration.test.ts` (a forced race between two engines)                                                                                   |
| Ordering and replay         | Every reaction suite ends with replay, integrity, and the re-decision oracle (`testing/verify.ts`). `reactions/property.test.ts`: 6 seeds × 70 random steps (casts, answers, closes, illegal commands, undos, random dice), checked after each step                                                              |
| Undo and rewind             | `reactions/undo.test.ts`: the trigger with no answer (window removed), after an answer (`UNDO_UNSAFE` naming it), reverse order, an answer that countered or let the spell through, earlier commands the window read, unrelated commands, as-of reads at every point of a window's life, leaving the battlefield |
| Visibility                  | `reactions/lifecycle.test.ts` (views); `packages/context/src/{reaction,leakage}.test.ts` (the suspended spell never changes a context); `apps/server/src/http/reaction-routes.test.ts` (the player's view does not depend on the spell); outsiders in `reactions/integrity.test.ts`                              |
| Acceptance case (Ravenford) | The Shaman's Ashen Bolt or Binding Hex opens a window; Elowen casts Counterspell or ignores it: unit, HTTP, PostgreSQL, and live server                                                                                                                                                                          |

Mutation checks: 17 reaction defects, injected one at a time, each detected and then reverted. The defects were:

- either half of the pause disabled;
- a second answer accepted;
- closed windows accepting answers;
- the window's combatant reads dropped;
- undo forgetting the window;
- a caster countering itself;
- completion on stale state;
- outsiders seeing the pause;
- context ignoring the pause;
- a candidate seeing the spell;
- a combatant leaving mid-fight;
- placements not depending on the encounter;
- unanswered candidates staying pending;
- a forced failed save;
- Counterspell not spending the Reaction;
- closing without resolving the cast.

## Commands and results (Node 25.8.1, pnpm 11.11.0, PostgreSQL 18)

| Command                                                   | Result                                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm validate:ci-local`                                  | PASS (format, lint, typecheck, budget, unit, clean build, migrate ×2, seed ×2, integration) |
| `pnpm test`                                               | PASS — 73 files, 862 tests                                                                  |
| `pnpm test:integration`                                   | PASS — 8 files, 31 tests                                                                    |
| `pnpm context-budget`                                     | PASS — 255 files, 0 over 500 lines                                                          |
| Fresh volume: `pnpm db:migrate`; `pnpm seed:ravenford` ×2 | PASS — 91 commands → version 100, 25 entities; the second run writes nothing                |
| Built server, live Counterspell flow over HTTP            | PASS (see the handoff). The development database was then reset and reseeded clean          |

## Assumptions and limitations

- Counterspell is the only reaction. Opportunity attacks are deferred by owner decision; monsters have no reactions; there are no Counterspell chains.
- Expiry happens only through an explicit close; there are no timers.
- Combatants learn that the encounter is paused (`REACTION_PENDING`); only candidates, the caster's player, and the DM see the window itself.
- Outside reaction windows, world time may still advance during combat (Stage 80 behavior). Earlier combat limitations (ADR 0015) still apply.
