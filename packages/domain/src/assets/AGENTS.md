# Assets (`src/assets/`)

Asset identity and lineage: requests for images of world entities, the external jobs that run them, the assets they produce, and each entity's canonical reference. Authority: `docs/adr/0022-asset-identity.md` (owner-approved triggers, approval, and visibility), ADR 0006 §9 (external work and undo), and `docs/adr/0035-images.md` §4 (purposes). Gate 05 reviewed this surface (`docs/GATE_COVERAGE.md`, Stages 150–160); Gate 06 reviews the Stage 330 additions (row 330).

| Concern                                                                   | File               |
| ------------------------------------------------------------------------- | ------------------ |
| Records, IDs (`<commandId>#<n>`, `<requestId>~asset`), settled/shown sets | `records.ts`       |
| Purposes in payloads (`purposeField`) and the kinds each purpose depicts  | `records.ts`       |
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
- Players see only `SHOWN_ASSET` statuses with audience `players`, of entities the perspective knows or perceives, as variant, purpose, version, content hash, and media type (`playerAssetView`). Anything else is `null` (a 404), the same as a nonexistent entity.
- Purposes (ADR 0035 §4): `image` (default), `figure` (character, NPC, creature) and `battle-map` (location); a figure or battle map is a derived variant of the canonical reference. A payload carries `purpose` only when it is not `image` (`purposeField`), so an image is written exactly as before purposes existed and old histories re-decide to the same events; the fold reads an absent purpose as `image`. Never write `purpose: 'image'` into a payload.
- Players see a purpose with the other safe fields; lineage, approval, visibility, and the undo hold do not depend on it. Presentation (`../visual/`) chooses images among `image` assets only.
- Tests: `lineage.test.ts` (identity, versions, variants, permissions, no world facts), `undo.test.ts` (queued, in-flight, completed, approval), `views.test.ts` (isolation), `purposes.test.ts` (purposes through the lineage, payloads, versions, undo, views), `assets.property.test.ts` (randomized, with integrity, the oracle, and replay), `purposes.property.test.ts` (random figures, battle maps and wrong-kind refusals, with presentation checked per perspective after every step); the lineage written before purposes in `packages/combat/src/asset-history.test.ts` (`fixtures/history/5da1b05-asset-lineage.json`).
