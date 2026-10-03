# Ravenford Fixtures

Canonical test fixtures for the Ravenford vertical slice (`RAVENFORD_SPEC.md`). Empty in Stage 0; fixtures are added by the stage that first needs them (World Kernel from Stage 10, knowledge scopes at Stage 20, and so on).

- Fixtures may contain WORLD_TRUTH and DM secrets. Never copy fixture secrets into player-facing code, prompts, or logs; tests must assert their absence from restricted projections.
- Keep data (JSON/YAML/CSV) separate from hand-written fixture builders. Builders are active code and obey the 700-line budget; datasets are not loaded wholesale — query them narrowly.
- Do not reconcile or change rules-dependent character data without the Stage 40 ruleset ADR (`docs/IMPLEMENTATION_PREREQUISITES.md`).
