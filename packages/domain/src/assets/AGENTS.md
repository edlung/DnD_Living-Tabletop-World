# Assets (`src/assets/`)

Asset identity and lineage: requests for images of world entities, the external jobs that run them, the assets they produce, and each entity's canonical reference. Authority: `docs/adr/0022-asset-identity.md` (owner-approved triggers, approval, and visibility) and ADR 0006 §9 (external work and undo). Gate 05 reviews this surface (`docs/GATE_COVERAGE.md`, Stages 150–160).

| Concern                                                                   | File               |
| ------------------------------------------------------------------------- | ------------------ |
| Records, IDs (`<commandId>#<n>`, `<requestId>~asset`), settled/shown sets | `records.ts`       |
| Event payloads and undo restores                                          | `events.ts`        |
| Decisions: request, worker reports, cancel, retract, approve              | `decide.ts`        |
| Requests an authoring commit adds for new NPCs and locations              | `authoring.ts`     |
| Fold and restores                                                         | `evolve.ts`        |
| Read/write footprints                                                     | `footprints.ts`    |
| The undo hold on started jobs and standing images                         | `hold.ts`          |
| Structural invariants (part of `checkWorldIntegrity`)                     | `integrity.ts`     |
| Player-safe assets, content visibility, the DM lineage                    | `views.ts`         |
| Test support: authoring world plus asset commands and full verification   | `testing/world.ts` |

Rules:

- Visual state is not world state (invariant 14). No asset event writes a world fact, and no gameplay decision reads the lineage. `lineage.test.ts` compares every world fact before and after.
- The worker's reports (`StartAssetJob`, `CompleteAssetJob`, `FailAssetJob`) are system-only. They, `CancelAssetRequest`, and `RetractAsset` are final: not undoable, folded as recorded by the re-decision oracle, and reading no fact a world command wrote. Keep it so, or a failed job would block undo forever.
- Undo safety for external work lives in `hold.ts`, not in footprints: a started job, or an image neither retracted nor discarded, blocks undo of the command that requested it.
- A job copies its request when it starts, so lineage survives an undo of the request. Never make job events require the request.
- Players see only `SHOWN_ASSET` statuses with audience `players`, of entities the perspective knows or perceives, as variant, version, content hash, and media type. Anything else is `null` (a 404), the same as a nonexistent entity.
- Tests: `lineage.test.ts` (identity, versions, variants, permissions, no world facts), `undo.test.ts` (queued, in-flight, completed, approval), `views.test.ts` (isolation), `assets.property.test.ts` (randomized, with integrity, the oracle, and replay).
