# 0033. Live session: scoped change signal, presence, DM substitution, DM history

- Status: Accepted (owner decisions of 2026-10-11 and 2026-10-15 recorded below; technical design by the session)
- Date: 2026-10-15
- Stage: 310
- Decision type: product (what a signal may reveal; what the DM may do for an absent player) and technical.
- Owner approval: Q9 (2026-10-11) — the DM may skip an absent player's turn or act as that
  character; hidden changes reveal nothing, including through notifications; presence never
  transfers authority. On 2026-10-15 the owner delegated design adoption to the session
  (`reviews/OWNER_DECISIONS_9_2026-10-15.json`). The full contract is `docs/STAGE_310_DESIGN.md`
  (draft 2, adopted).

## Context

Clients refreshed only after their own commands or a manual "Refresh world", so a player did not
see the DM's actions, a reaction window opened by the DM, or published authoring until reloading.
ADR 0029 §8 kept authoring undo on screen-local state, lost on reload. The "Advance to Day 2"
control stayed offered after Day 2.

## Decisions

1. **One streamed endpoint per subscription** (`GET …/live`) with SSE framing over `fetch`, so
   the credential stays in the header; messages carry no world content (`ready`, `changed` with
   the subscription's own counter, `closed` with a fixed reason, heartbeats).
2. **A signal means "a view you may read changed".** The server fingerprints the bodies of the
   subscriber's own HTTP views by injecting GETs, with the subscriber's credential and
   perspective, into a silent second instance of the same application. The views are listed in
   the design's coverage inventory. No new code decides visibility; secret-only commits cannot
   change the fingerprint. Comparison runs on a fixed 1 s cycle and closes the stream on any
   401/403/404 or computation failure.
3. **The baseline precedes `ready`**, and clients reload on `ready` and on every reconnect; no
   global cursor is replayed.
4. **Background refresh keeps shown data** until new data arrives and never replaces drafts or
   focus; signals coalesce.
5. **Presence** is ephemeral: live subscriptions per controlling player, filtered to characters in
   the requesting perspective's own entity view, plus whether the DM is connected; never an actor
   ID or a hidden roster entry.
6. **DM substitution uses the existing kernel authority** (the DM may issue player commands for
   any character, ADR 0013). The client adds "Skip the turn" (`EndTurn`) and "Act as …" to the
   DM's combat controls; the DM's reason is stored in a DM-only audit table
   (`ltw_dm_substitutions`, migration 0009) keyed by command ID — descriptive metadata, while the
   stored command with the DM as issuer stays the canonical record. Undo is the existing
   `UndoCommand`.
7. **DM history** (`GET …/dm/history`, DM only) lists authoring commits and DM substitutions from
   durable history with canonical status and current undo availability; it replaces ADR 0029 §8's
   screen-local undo. Amended 2026-10-28: it also lists the DM's world-time and weather changes
   (see Amendments).
8. **The day control** offers the next day's morning computed from the current world time.

## Consequences

- Each live subscription costs one batch of view requests per second; the per-actor (4) and
  per-process (200) caps bound it. The design promises protocol non-disclosure, not constant-time
  execution under shared load.
- A query-dependent view outside the inventory refreshes on any signal while shown but does not
  itself raise one.
- Gate 06 reviews the stream, presence, substitution audit and DM history routes
  (`docs/GATE_COVERAGE.md`).

## Amendments

- 2026-10-28 (owner decision SI-D4-time-in-history, `reviews/OWNER_DECISIONS_11_2026-10-28.json`;
  evidence `reports/evidence/stage-360/ai-stand-in/dm/notes.md` steps 36, 42): **time and weather
  in the DM history.** §7 also lists the `AdvanceWorldTime` and `SetWeather` commands the
  campaign's DM issued at the table, through `POST …/commands` (stored as
  `http:<dmActorId>:<clientCommandId>`); the seed's setup clock is not listed. A new entry kind
  `world` (`DmWorldEntry`) carries the change as the World Engine recorded it: the clock's `from`
  and `to` (`WorldTimeAdvanced`), or the place, its own weather before (null when it had none)
  and after (`WeatherSet`). The client reads it as «Время: День 1 · 10:00 → День 2 · 10:00» /
  "Time: Day 1 · 10:00 → Day 2 · 10:00" and «Погода (Рыночная площадь): ясно → дождь» /
  "Weather at Market Square: clear → rain", with "Undo this change". Undo is the existing
  `UndoCommand` with its rules, unchanged: availability is `previewUndo`'s dry decision, and since
  almost every later command reads the clock, a time change is usually blocked by the commands
  after it, which History names with "Undo … first" as for any entry. No new command, event or
  authority. A command whose recorded event is not its change (never for an accepted command)
  is left out of the page and logged by command ID and type, never failing the page or the DM's
  live stream. Known limitation, as for substitutions: entries are matched to the campaign's
  current DM (`dmActorId`), so if the DM changed, the earlier DM's time and weather changes are no
  longer listed; their undo remains the plain `UndoCommand`.
