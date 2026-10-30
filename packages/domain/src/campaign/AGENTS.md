# Campaign initial plans (Stage 390)

Read accepted ADR 0038 / `docs/STAGE_370_DESIGN.md`, current work order and
`ARCHITECTURE_INVARIANTS.md`. These functions are pure; no I/O, random IDs or clocks.

- `plan.ts` compiles declarative content into ordered initial commands; callers
  must still run the World Engine's own decisions in an isolated store.
- `references.ts` checks local keys, opaque mappings and graph references;
  `story.ts` validates prepared declarations and rewrites quest entity references.
- No generated future scenario, encounter, decision or memory is executed here.
- Party keys denote prepared seats. Never invent player/controller identities.
- IDs come from server-owned mappings; missing/colliding IDs block the entire plan.
- Tests/specimens live under `testing/`; never import them in runtime sources.
