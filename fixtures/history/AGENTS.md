# Event Histories From Earlier Revisions

Campaign streams that an earlier revision stored, kept so the current reader is tested against genuine old events, not only its own (Gate 03 retest 2, G03-H05; `docs/adr/0007-world-kernel-model-and-event-store.md`).

| File                          | Writer revision              | Content                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `88d8137-gate03-retest1.json` | `88d8137` (Gate 03 retest 1) | The `ravenford` stream (178 events, 125 commands): the full seed, then Detect Magic passing over a far charm (version 1 `placement` premise), a cast the DM undid, Hunter's Mark and Healing Word by Elowen outside a fight, a fight with Detect Magic, a countered Ashen Bolt, an expired Binding Hex, and an undone `EndCombat`. Steps by name in `labels`. |

- **Never edit, reformat, or regenerate a file here** (they are excluded from Prettier). They are what that revision wrote; a fixed copy would prove nothing. A new history gets a new file.
- Rows are exactly as the writer's `PostgresEventStore` stored them (`ltw_event_streams`, `ltw_commands`, `ltw_events`), one per line. Tests read them like the current store reads rows: `packages/combat/src/testing/history.ts` (in memory) and `apps/server/src/testing/history-rows.ts` (inserted into PostgreSQL).
- `WRITERS.md` holds the script and steps that produced each file.
- Before a change to an event payload schema, add a history written by the revision before it (see the kernel rules in `packages/domain/src/kernel/AGENTS.md`).
- Do not load these files wholesale: query them with `jq` (for example `jq '.labels' <file>`, or `jq '.events[] | select(.sequence == 104)' <file>`).
