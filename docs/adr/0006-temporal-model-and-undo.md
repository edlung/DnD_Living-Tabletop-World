# 0006. Temporal model, canonical history, and undo

- Status: Accepted
- Date: 2026-10-03
- Stage: 10 (kernel portion); extended at Stages 20, 30, 90, 110, 150
- Decision type: product (requires owner approval)
- Owner approval: approved as written by the project owner on 2026-10-03 (Claude Code session, Stage 10 kickoff)

## Context

`docs/IMPLEMENTATION_PREREQUISITES.md` requires this decision before the World Kernel's persistence/replay contract is implemented. Invariants 1, 11, 12, and 13 require validated mutation, auditable mutation, reconstructable history, and stable identity. `ADVERSARIAL_TESTS.md` (D, F5, H, I) requires that undo never silently erases dependent history, that duplicates are handled, and that impossible timelines are rejected.

## Options considered

1. **Mutable tables plus an audit log.** Familiar, but history becomes a side channel that can drift from state; replay and as-of queries are unreliable.
2. **Snapshot rollback for undo.** Simple, but it erases history and the dependents built on it, which violates the undo acceptance criteria.
3. **Undo limited to the most recent command (stack).** Always safe, but any unrelated later action, such as a player moving, blocks a safe DM undo during live play.
4. **Append-only event history with selective, dependency-checked compensation.** Chosen.

## Decision

### 1. Canonical history

Each campaign has exactly one append-only, totally ordered event stream. Canonical state is a pure function of that stream (`replay`). Events are never updated or deleted. The database enforces this as well. Every later domain (knowledge, memory, combat, authoring) appends to the same campaign stream through the World Engine. Ordering therefore spans all domains.

### 2. Supported temporal domains

| Domain             | Clock                                                                   | What must be reconstructable                                                                                                                                           | Introduced                                                                                              |
| ------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Record history** | Stream sequence (plus `recordedAt` wall-clock time, informational only) | Exact canonical state after any event, including commands later undone and their compensations. Answers "what did the system record, in what order, by whom, and why". | Stage 10, all domains                                                                                   |
| **World timeline** | World time (fictional clock)                                            | For any world time not later than the current clock, under the _current_ canon: which entities existed, where they were, their status, and which scenes were running.  | Stage 10 (kernel facts); knowledge (20), memory (30), visual state (160), and Chronicle (170) extend it |

World time is a signed integer count of seconds since the campaign epoch (Day 1, 00:00:00). Calendars and weather are presentation and are not part of this decision. Future world times, meaning scheduled events, are not supported.

### 3. World time vs persistence time

- The world clock moves only through an explicit, DM-authorized `AdvanceWorldTime`, and only forward. Every event records the world time at which it happened in the fiction, and separately the record sequence and wall-clock time.
- **In-world facts change at a world time:** placement (where an entity is), status (alive, dead, destroyed), and scenes. Reconstructing the timeline at world time _T_ uses their world times.
- **Authoring corrections are timeless:** editing an entity's name or description corrects the canon for the entity's whole timeline. Record history still shows the earlier value as of earlier records. An in-world name change would be a separate, explicit event type, if one is ever needed.
- **Later authoring of pre-existing fiction.** Every entity declares when it began to exist in the fiction (`existsSince`: a world time, or "before recorded history"). A newly authored entity may have backstory: Tomas, authored at Day 1 14:00, can exist since 22 years earlier, and his initial placement may start in the past ("stationed at North Gate since Day 1 04:00"). That placement must lie within both his existence and the location's, and not later than the clock. Children of a location cannot exist before their parent.
- Other retroactive in-world changes, such as moving an existing NPC "as of yesterday", are **not supported** by the kernel. Later stages may add them only together with continuity validation (Stages 110/120).

### 4. Identity

Entity, location, and scene IDs are immutable, unique within the campaign, and **never reused**, even after their creation is undone. Locations are world entities, so knowledge, assets, and Chronicle can refer to every world thing the same way. Names and descriptions are mutable state, never identity. Campaign, event, and command IDs are globally unique.

### 5. Ordering

The per-campaign sequence (1, 2, 3, … with no gaps) is the only canonical order. Wall-clock time never orders events. The events of one command are contiguous and keep the order the command produced them in. Ignoring undone commands and their compensations, world time never decreases along the stream.

### 6. Nondeterministic inputs

Generated IDs, wall-clock timestamps, and later dice results, AI outputs, model metadata, and external job results are captured in the command record or in events when they occur. Replay only folds recorded events. It never re-runs decisions or consults clocks, random number generators, AI, or external services.

### 7. Duplicate commands, atomicity, concurrency

- Every command carries a caller-supplied command ID (an idempotency key). Resubmitting the same command returns the original outcome without re-executing it. Reusing the ID with different content is rejected.
- A command's events and its audit record (actor, reason, resolved command) are committed together or not at all. Rejected commands change nothing.
- Writers use optimistic concurrency on the campaign stream. A writer that lost a race re-validates against the newer state; nothing is applied on stale assumptions.

### 8. Undo

- **Who:** the campaign's DM (or an internal system process). Players cannot undo.
- **What:** one accepted command at a time, identified by its command ID. Campaign creation and undo itself (that is, redo) are not undoable in Stage 10.
- **How:** undo appends an explicit `CommandUndone` compensating event that records the exact prior values it restores. The original events stay in history, and the original command is marked undone. Every step is auditable.
- **When:** only if no later, still-effective event read or changed any fact the target command changed. Otherwise the undo is **rejected** (`UNDO_UNSAFE`) and the blocking commands are listed. The DM can undo those explicitly first. Undoing a time advance is therefore possible only while nothing has happened since.
- **Never:** silently erase or rewrite dependent history, or reuse an undone entity's ID.

### 9. Dependencies introduced by later domains

Each event declares the facts it read and wrote. Later domains add their facts to the same mechanism, which makes dependencies explicit:

- **Knowledge (Stage 20) and authoring (Stage 110):** knowledge assigned to Tomas reads Tomas's existence. A player discovery derived from that knowledge reads the knowledge. "Create Tomas → player learns testimony → undo Tomas" is therefore rejected with explicit blockers. Stage 110 implements the safe Tomas undo path. It may offer a DM-confirmed cascade that compensates each dependent explicitly, but never silent erasure.
- **Memory (Stage 30):** memories read the events and entities they recall, so undo of a remembered fact is blocked until the memory dependency is resolved explicitly.
- **Reactions (Stage 90):** an open reaction window depends on its trigger. Undo or rewind while a window is open must follow this rule or be rejected; Stage 90 declares and tests it.
- **External asset work (Stage 150):** a started external job cannot be recalled. It blocks undo of what it depicts until its outcome is explicitly cancelled or retracted. Generated assets are retained for lineage.

## Consequences

- Stage 10 implements: the campaign stream, replay, as-of-sequence and as-of-world-time reconstruction for kernel facts, idempotency, atomic optimistic appends, append-only enforcement in PostgreSQL, and undo for kernel commands.
- Later stages must declare the read/write facts of each new event type and test undo safety for them.
- History grows without bound; snapshots may later cache replay, but they never replace the stream.
- Because IDs are never reused, recreating something after an undo yields a new identity.

## Amendments

- 2026-10-04 (Stage 90, ADR 0016 §3): the §9 reaction obligation is declared and implemented. The §8 rule applies unchanged to reaction windows. The opening of a window reads the encounter and every considered combatant, and every answer reads the window, so:
  - undo inside a window is strictly reverse;
  - undoing the trigger is rejected once anyone answered;
  - with no answer yet, undoing the trigger removes the window together with the suspended spell.

  Rewind is a sequence of checked undos or an as-of read; it is never a separate operation.

- 2026-10-04 (Gate 03 remediation):
  - **Reopening a window.** Undoing the command that closed a reaction window is also rejected while a later, still-effective command changed what the window depends on.
  - **Results that changed nothing** still record what they read: combat decisions read every combatant, and examinations read the clues they passed over and where the things they could not reach were. Their premises therefore block unsafe undo like any other read.
- 2026-10-04 (Gate 03 retest 3 remediation, G03-H07; owner decision of 2026-10-04): **history from earlier versions comes off only from its end.**
  - Earlier versions of the system did not always record every fact a decision rested on. For example, revision 88d8137 recorded a spell cast outside an unrelated fight without its target's status or either participant's placement.
  - A command decided by an earlier version therefore rests on everything before it. While it stands, nothing beneath it can be undone (`UNDO_UNSAFE`, listing the old commands that still stand after it). Old history is undone from its newest command backwards.
  - History written by the current version is undone exactly as above. An earlier version's own undo records stay as they are.
  - In practice this affects only campaigns started before the upgrade; today those exist only in test databases.

- 2026-10-04 (Stage 110, ADR 0018 §7; owner decision of 2026-10-04): the §9 authoring obligation is implemented.
  - An authoring commit is one command (`ApplyAuthoring`), so it is undone as one unit: one `CommandUndone` restores the NPC, its placement, its knowledge, and its disclosure.
  - "Create Tomas → player learns testimony → undo Tomas" is rejected (`UNDO_UNSAFE`) with the conversation listed as the blocker; a memory naming Tomas blocks it the same way. The DM undoes the blockers explicitly, newest first, then the commit. The owner chose these explicit blockers over a DM-confirmed cascade; no cascade is offered.
  - Undone authoring keeps its history and its IDs: re-creating `tomas-reed` is rejected.

- 2026-10-04 (Stage 120, ADR 0019): relationships and continuity premises follow §8.
  - Undoing `SetRelationship` restores the previous attitude. A relationship change reads its NPC, which therefore cannot be undone beneath it.
  - An authoring commit that checked a holder's status history records it (`AuthoringPremisesRecorded`), so undoing a death or resurrection beneath such a commit is refused.
  - A contradiction reads the names its statement quotes (ADR 0014 Stage 120 amendment), so undoing such a rename beneath it is refused.
- 2026-10-04 (Stage 130, ADR 0020): the §8 rule covers NPC interactions.
  - An answer (`AskAbout`) reads the NPC's attitude whenever it considered a guarded record, the shown subject that unlocked one, and every record about the topic it passed over, withheld or told before. Undoing a disclosure change, an attitude, a showing, or an earlier answer beneath it is refused while it stands.
  - An Insight reads every record the NPC holds about the topic and its disclosure; a showing reads the evidence and the NPC's presence.
  - A play memory reads the names its summary quotes (`named`).
  - Commands earlier writers decided with incomplete records of these kinds carry version 2 memories or contradictions, so they rest on everything before them (ADR 0007 Stage 130 amendment).

- 2026-10-04 (Stage 150, ADR 0022 §4): the §9 external asset obligation is implemented.
  - Asset lineage is recorded in the campaign stream but writes no world fact. Starting, completing, failing, cancelling, and retracting asset work are final (`UNDO_NOT_SUPPORTED`) and read nothing a world command wrote.
  - **The hold.** Undoing a command that requested an asset (`RequestAsset`, or an authoring commit that created an NPC or a location) is refused (`UNDO_UNSAFE`) while the job runs, or while its image is neither retracted nor discarded. The latest job or approval command is named as the blocker. Cancelling the job or retracting the image releases the hold.
  - A queued request comes off with the undo. A failed, cancelled, or retracted job keeps its lineage after the entity is gone; an image that arrives after its job was cancelled is recorded as discarded.
  - Approving an asset is undoable under §8.

- 2026-10-04 (Stage 160, ADR 0023; owner decision of 2026-10-04): **weather is a world fact.** This supersedes §2's sentence that weather is presentation; calendars stay out of scope.
  - The DM sets a location's weather from the current world time on (`SetWeather`). It is undone like any other fact.
  - The world timeline at T gains weather, day phases, and vitals (hit points, conditions, equipment) from effective events by their world times.
  - Visual state at T is derived from that timeline and the current approved images; it is never stored.

## Invariants affected

Implements 1, 11, 12, and 13 for the kernel and preserves 3 (only the DM authors and undoes). No invariant is weakened.
