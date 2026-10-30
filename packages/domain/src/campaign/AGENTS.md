# Campaign preparation plans and bootstrap (Stages 390, 440)

Read accepted ADR 0038 / `docs/STAGE_370_DESIGN.md`, current work order and
`ARCHITECTURE_INVARIANTS.md`. These functions are pure; no I/O, random IDs or clocks.

- `plan.ts` compiles declarative content into ordered initial commands; callers
  must still run the World Engine's own decisions in an isolated store.
- `references.ts` checks local keys, opaque mappings and graph references;
  `story.ts` validates prepared declarations and rewrites quest entity references.
- `generation-validation.ts` checks each generated partition before accepting it:
  topology may defer future cast actors, but cast must declare its exact prepared
  party and resolve existing conflict actors/relationships/visual references.
  Later steps validate their own references against resolved earlier sections.
  Generated cast must place every active physical entity, including nonparty NPCs,
  creatures, items and features; inactive/offstage content and abstract factions
  retain the ordinary package rules. This generation requirement does not narrow
  the global owner-authored package/compiler contract.
  Reuse compiler validators; never require future collections prematurely, invent
  missing entities, or turn a semantic failure into a successful empty result.
- No generated future scenario, encounter, decision or memory is executed here.
- `bootstrap-plan.ts` adds prepared party seats and ordered chosen-asset descriptors;
  `bootstrap.ts` decides the whole initial batch against provisional state. It is a
  dedicated owner-confirmed command, never an in-play `ApplyAuthoring` expansion.
- `bootstrap-events.ts` / `bootstrap-evolve.ts` preserve the final source and consent
  bindings. `bootstrap-consent.ts` is the engine's dedicated confirmation gate.
- Canonical `preparedParty` is optional for legacy state and grants no actor control;
  `../knowledge/party.ts` unions seats with roster membership for semantic readers.
- Adopted bytes use `../assets/adoption.ts` and a durable `origin`, never fake image
  requests/jobs. The server verifies bytes and source rows before publication.
- Party keys denote prepared seats. Never invent player/controller identities.
- IDs come from server-owned mappings; missing/colliding IDs block the entire plan.
- Tests/specimens live under `testing/`; never import them in runtime sources.
