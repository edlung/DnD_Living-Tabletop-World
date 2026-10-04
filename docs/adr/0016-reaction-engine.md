# 0016. Reaction Engine: reaction windows and Counterspell

- Status: Accepted
- Date: 2026-10-04
- Stage: 90; extended by later stages that add reactions
- Decision type: product (requires owner approval), with technical notes
- Owner approval: approved as written by the owner on 2026-10-04, before implementation. Owner choices: opportunity attacks deferred; windows expire only when the DM (or the system) closes them; a candidate's player sees the caster and the components, not the spell's identity or target

## Context

`ARCHITECTURE.md` (Reaction Engine) defines the pipeline: domain event → reaction matcher → candidates → deterministic eligibility → `ReactionWindowOpened` → decision → resolved or expired. Invariant 10 says reactions are domain events, not client conveniences. `RAVENFORD_SPEC.md` makes one case mandatory: the Goblin Shaman casts a spell that opens a valid Counterspell window, and the player can cast Counterspell or ignore it; an invalid Counterspell must be rejected by the Rules.

The pieces already exist:

- ADR 0011 fixes the Counterspell mechanics: a Reaction, a creature within 60 ft that the caster can see, a spell with V, S, or M components; the target makes a Constitution save, and on a failure its spell has no effect, the action is wasted, and its slot is not expended.
- ADR 0015 deferred every reaction to this stage, including opportunity attacks.
- ADR 0006 §9 requires this stage to declare and test undo or rewind while a window is open, and to reject what is unsafe.

Gate 03 will try to double-spend reactions, use expired or stale windows, react after the trigger resolved, race concurrent responses, exploit replay and event ordering, and roll back inconsistently while a window exists.

## Options considered

1. **The client asks the player before sending the spell.** Simple, but the reaction is then a client convenience, outside history and outside the Rules (violates invariant 10).
2. **Resolve the spell, then let a reaction rewrite the result.** History would show an effect that later "did not happen", and every later command would depend on a provisional result.
3. **Suspend the spell in a canonical window, pause the encounter, and resolve the spell when the window closes.** Chosen.

## Decision

### 1. The reaction window

A reaction window is a canonical record with its own ID. It is created and changed only through World Engine commands, every change is an event, and history keeps every window.

- **Trigger.** A combatant casts a spell with V, S, or M components. Every slice spell and both Shaman spells qualify. The cast is checked exactly as in Stage 80.
- **Eligibility** (deterministic, decided by the Rules). A candidate is a character combatant, other than the caster, for which the Rules accept Counterspell at that moment:
  - alive and not Incapacitated;
  - knows Counterspell;
  - has its Reaction (one per round, regained at the start of its own turn);
  - can expend a slot of level 3 or higher (the one-slot-per-turn rule applies);
  - is within 60 ft of the caster, and the caster is not in total cover.

  Candidates are listed in initiative order. Allies are candidates too: countering an ally is legal (invariant 20), and ignoring is always one click.

- **Opening.** With no candidate, the spell resolves at once, as in Stage 80. Otherwise the spell is suspended:
  - the caster's Action (or Bonus Action) is spent;
  - nothing else happens yet: no slot, no effect, no Concentration change;
  - `ReactionWindowOpened` records the window (trigger, candidates, round).
- **Pause.** While a window is open, the encounter waits.
  - The only combat commands accepted are the window's responses and its close (below).
  - Any other command that would change something the window depends on is rejected with `REACTION_PENDING`: the encounter, the world clock, or any combatant's status, location, sheet, or stat block.
  - Commands that touch none of these still work: knowledge, memory, clues, profiles, investigation.
  - At most one window is open at a time.
- **Responses.** Each candidate answers once:
  - **Counterspell** (`UseReaction`). The Rules check it again, then it spends the Reaction and the slot. The caster makes a Constitution save against the reactor's spell save DC.
    - Save failed: the spell is countered. It has no effect, the caster's action stays spent, and a slot the caster would have used is not expended. The window closes as `countered`.
    - Save succeeded: the Counterspell is spent without effect, and the window stays open for any other pending candidate.
  - **Ignore** (`DeclineReaction`).
  - When no candidate is pending, the window closes as `proceeded`. The suspended spell resolves in that same command, against the state as it is then (for example, the reactor's spent slot) and with that command's recorded dice.
- **Expiry.** The DM, or a system process, may close an open window (`CloseReactionWindow`). Candidates who have not answered are recorded as expired, and the spell proceeds. Stage 90 has no timers; a later stage may add one that issues this same command.
- **Stale, late, and repeated responses:**
  - a response to a window that is not open (closed, expired, undone, or unknown): `REACTION_WINDOW_CLOSED`;
  - a second answer from the same candidate: `ALREADY_RESPONDED`;
  - an answer from a combatant that is not a candidate: `NOT_A_CANDIDATE`;
  - retrying the same command ID returns the original outcome and never acts twice (ADR 0006 §7).
- **Traceability.** Each window records the command that opened it and the command that closed it. Its events record every answer, roll, and outcome.

### 2. Ordering and concurrency

- The campaign stream is the only order (ADR 0006 §5, §7). Racing commands are serialized: the one recorded second is decided again against the newer state, and nothing is applied on stale assumptions.
- **Same candidate, two answers at once:** exactly one is accepted.
- **An answer racing the DM's close:** whichever is recorded first wins, and the other is rejected as above.
- Every roll comes from the recorded entropy pools (ADR 0015). Replay only folds events, and the re-decision oracle reproduces every effective command.

### 3. Undo and rewind with an open window (fulfils ADR 0006 §9)

The ADR 0006 §8 rule is unchanged: an undo is accepted only if no later, still-effective command read or changed what its target changed; otherwise it is `UNDO_UNSAFE` and lists the blockers. Applied to windows:

- **The trigger.** The trigger command opened the window, and every answer and the close read the window.
  - Once anyone has answered, undoing the trigger is rejected.
  - With no answer yet, undoing the trigger removes the window together with the suspended spell, and the caster's action is restored.
- **Strictly reverse order within a window.** The latest answer is undone first. Undoing the answer that closed the window reopens it exactly as it was: slots, Reactions, hit points.
- **What the window read.** When it opened, the window read the encounter and every combatant's status, location, sheet, or stat block. While it stands, undoing an earlier command that changed any of these is rejected.
- **Unrelated commands**, such as knowledge, can still be undone.
- **Rewind** is not a separate operation. It is either a sequence of individually checked undos (latest first), or an as-of read of record history, which shows each window exactly as it was then.

### 4. What players see

- **Encounter view** (ADR 0015 §6) gains the open window:
  - **DM:** the trigger (caster, spell, target or point), the candidates, and their answers.
  - **Player whose character is a candidate:** the caster (name only when known), that a spell is being cast and its components, their own answer, and their choices (Counterspell or Ignore). Not the spell's identity, target, or save DC, and not the other candidates.
  - **Player whose character cast the suspended spell:** that it awaits reactions.
  - **Other players:** nothing about the window.
- **Context Engine** (amends ADR 0012):
  - While a window is open, combat actions are illegal with `REACTION_PENDING`.
  - A pending candidate who selects the caster sees a `counterspell` action. Its legality and cost (slot level) come from the Rules, and its relevance is high.
- **Command outcomes:**
  - Counterspell: whether it countered the spell.
  - Ignore: acknowledged.
  - A suspended cast: awaiting reactions.
  - Monster rolls and the caster's save stay DM data. Reaction events are DM data, like every combat event.

### 5. Combat placement during an encounter (amends ADR 0015)

Positions are the only location of a combatant while an encounter runs, and eligibility depends on them. A combatant therefore cannot change location until the encounter ends: `EnterLocation` and `PlaceEntity` for a combatant are rejected.

### 6. Not in Stage 90

- **Other reactions.** Counterspell is the only one. Opportunity attacks need movement interrupted mid-path and monster reactions decided by the DM; by the owner's decision they move to a later combat-rules extension with its own ADR amendment. Until then, moving away from an enemy provokes nothing.
- **Monster reactions.** Stat blocks have no reactions.
- **Counterspell chains.** A Counterspell does not itself open a window, so nested windows do not exist. No slice creature can counter a Counterspell.
- **Windows outside combat.**
- **Timed expiry.**

## Technical notes

- **Package.** `@ltw/combat` gains `src/reactions/`: the matcher and eligibility, the responses, and the completion of the suspended spell. The domain gains the window record, events, fold, footprints, and undo restores. The kernel's central decision applies the pause rule, using the facts the window's opening read, so no command path can skip it.
- **State.** Every window is kept by ID; at most one is open. The fact key is `reaction:<windowId>`; undo restores the prior window value.
- **Events:** `ReactionWindowOpened`, `ReactionUsed`, `ReactionDeclined`, `ReactionWindowExpired`, `ReactionWindowResolved`. The Counterspell is also recorded as a `SpellCast`, and the caster's save as a `SavingThrowRolled` with purpose `counterspell`.
- **Commands:**
  - `UseReaction { combatantId, windowId, reaction: 'counterspell', using? }` and `DeclineReaction { combatantId, windowId }`: issued by the candidate's player for their own character, or by the DM.
  - `CloseReactionWindow { windowId }`: DM only.
- **New rejection codes:** `REACTION_PENDING`, `REACTION_WINDOW_CLOSED`, `NOT_A_CANDIDATE`, `ALREADY_RESPONDED`.
- **IDs and dice.** The window ID is drawn with the trigger command's resolution. The closing command's own recorded entropy and IDs resolve the suspended spell.

## Implementation notes (post-approval; they only tighten §4)

- **Outsiders cannot probe.** A character outside the encounter must not learn that a fight, or a window, exists.
  - Its combat commands get exactly the answer they get when no encounter runs: `NOT_IN_COMBAT`, with the same message.
  - Its answers to a window get `REACTION_WINDOW_CLOSED`.
  - The pause applies only to combatants and to DM-only combat commands.
- **Counterspell comes first.** In the Context Engine, the `counterspell` action is listed first among a creature's actions, because the encounter waits for it.

## Amendments

- 2026-10-04 (Gate 03 remediation, G03-H01, G03-H02):
  - **Reopening by undo.** Undoing the command that closed a window puts the window back, open, before every later command. Such an undo is therefore rejected (`UNDO_UNSAFE`, with blockers) while any later, still-effective command changed something the window depends on: the facts its opening read. Undoing those commands first makes the reopening safe. Unrelated later commands do not block it.
  - **Everything a combat decision read.** Every combat decision records each combatant's status, sheet, and stat block as premises. This includes results that changed nothing, such as a miss or a turn passing over the dead. Combat therefore unwinds strictly in reverse order, DM edits of combatants included.
  - **An open window stays legal.** The tests check after every step that an open window's suspended spell can still resolve and that every pending candidate can still react.

## Consequences

- The mandatory Ravenford case runs end to end: the Shaman's Ashen Bolt or Binding Hex opens a window, and Elowen counters it or ignores it.
- Gate 03 attacks a single, explicit lifecycle: one open window, serialized answers, closed windows that reject everything, and undo that follows the existing footprint rule.
- Later reactions (opportunity attacks, Shield, monster reactions) reuse the window, the pause, and the undo rule; each needs its own trigger and eligibility entry here.

## Invariants affected

Implements 10. Fulfils the ADR 0006 §9 obligation for reactions. Preserves 1, 8, 9, 11, 12, and 20: every legal Counterspell can be chosen, and ignoring is always possible. No invariant is weakened.
