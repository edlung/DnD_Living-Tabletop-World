# Ravenford Fixtures

Canonical test fixtures for the Ravenford vertical slice (`RAVENFORD_SPEC.md`), added by the stage that first needs them.

| File                      | Stage | Content                                                                                                                                                                                                                                           |
| ------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kernel-seed.json`        | 10    | Public World Kernel seed: campaign, locations, Mira, Orin, Thorne (arrived 240 days before Day 1), Elowen, arrival scene. A command script run through the World Engine (`submissionsFromScript`), never inserted directly.                       |
| `knowledge-seed.json`     | 20    | **Contains secrets.** Factions (Ashen Circle with an opaque ID), caravan, evidence entities, Elowen's player assignment, and 30 knowledge records across WORLD_TRUTH, DM, PUBLIC, PARTY, CHARACTER, and NPC scopes. Seeded after the kernel seed. |
| `knowledge-boundary.json` | 20    | Gate 01 specification: the exact records each perspective sees, and text that must never appear for it. Shared by domain and HTTP tests; update it with the seed.                                                                                 |
| `personas.json`           | 20    | Development persona tokens (DM, Elowen's player, outsider). Not secrets; refused in production.                                                                                                                                                   |

- Fixtures may contain WORLD_TRUTH and DM secrets. Never copy fixture secrets into player-facing code, prompts, or logs; tests must assert their absence from restricted projections.
- Keep data (JSON/YAML/CSV) separate from hand-written fixture builders. Builders are active code and obey the 700-line budget; datasets are not loaded wholesale — query them narrowly.
- Do not reconcile or change rules-dependent character data without the Stage 40 ruleset ADR (`docs/IMPLEMENTATION_PREREQUISITES.md`).
