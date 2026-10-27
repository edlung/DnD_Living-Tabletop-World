# 0008. Knowledge records, scopes, and perspective boundary

- Status: Accepted
- Date: 2026-10-03
- Stage: 20; consumed by Stages 30, 50–70, 110–130, 170
- Decision type: product (requires owner approval)
- Owner approval: approved as written by the project owner on 2026-10-03 (Claude Code session, Stage 20 kickoff)

## Context

`PRODUCT_BLUEPRINT.md` defines knowledge types (FACT, EVIDENCE, TESTIMONY, RUMOR, INFERENCE, HYPOTHESIS, CONTRADICTION, UNKNOWN, SECRET) and scopes (WORLD_TRUTH, DM, PUBLIC, PARTY, CHARACTER, NPC). Its rule is that player knowledge is not world truth. Invariants 4–7 require that projections contain only permitted information, that NPC context is scoped, and that inferences never silently become facts. Gate 01 attacks this boundary directly and indirectly. This ADR fixes who may see what.

## Options considered

1. **Filter canonical data per request (deny-list).** Every new field or path must remember to hide secrets, so one omission leaks.
2. **Shared records with per-record ACLs.** One record known by many holders makes "who knew what, since when" and later dependencies ambiguous.
3. **One holder scope per record, whitelisted projections.** Chosen. Sharing knowledge creates a new record in the receiving scope, optionally linked to its source.

## Decision

### Knowledge records

- Each record has exactly one **scope** (holder), a **type**, a **statement**, optional **subjects** (world entities it is about), and an optional **attribution** (who said it). Attribution is required for TESTIMONY and allowed for RUMOR.
- Records may also have **relations** to other records (`SUPPORTS`, `CONTRADICTS`, `DERIVED_FROM`, `REFERS_TO`) and a **knownSince** world time: when the holder learned it, or "before recorded history".
- `knownSince` may lie in the past within the holder's existence, but never after the world clock.
- Records are immutable in Stage 20; a type can never change. Valid transitions such as hypothesis → fact are Stage 70's decision, never a silent update (invariant 7).
- WORLD_TRUTH records are FACT or SECRET. The other scopes may hold any type.
- Only the DM (or a trusted system process) adds knowledge in Stage 20, through the World Engine. Adding knowledge is auditable and undoable under ADR 0006. A record depends on its holder, subjects, attribution, and related records, so those cannot be undone while it stands.

### Perspectives

| Perspective  | Sees records in scopes                               | Who may request it                                                      |
| ------------ | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| DM           | all, plus provenance (actor, command, record order)  | the campaign DM                                                         |
| PUBLIC       | PUBLIC                                               | DM, any player in the campaign                                          |
| PARTY        | PUBLIC, PARTY                                        | DM, any player in the campaign                                          |
| CHARACTER(c) | PUBLIC, CHARACTER(c), and PARTY if c is in the party | DM; the player controlling c                                            |
| PLAYER       | the requesting player's own CHARACTER perspective    | that player                                                             |
| NPC(n)       | PUBLIC, NPC(n)                                       | DM (to preview); later the server's own NPC context builder (Stage 130) |

- NPCs never see PARTY, other NPCs, CHARACTER, DM, or WORLD_TRUTH knowledge. An NPC holding a SECRET-typed record sees it in its own perspective; whether it discloses is Stage 130 (knowledge and willingness are separate).
- **Party:** the characters the DM assigned to players. One character per player. Access follows the current assignment.
- **No defaults or fallbacks:** a missing, malformed, duplicated, or unpermitted perspective is rejected; it never falls back to a broader view. Users outside the campaign get nothing.

### Projection rules (all non-DM perspectives)

- Projections are built only from records that pass the scope rule, and each output field is chosen explicitly. Canonical data never passes through wholesale.
- A **relation** appears only if both ends are visible. Hidden records leave no trace: no IDs, counts, placeholders, or "contradicted by something you can't see".
- **Entities:** a perspective knows an entity only if it is a subject or attribution of a visible record, is the perspective's own character or NPC, or is a party member (PARTY and CHARACTER perspectives). Known entities expose only ID, kind, and canonical name — never the canonical description, placement, status, or other DM data.
- An entity whose identity must stay secret therefore gets an opaque ID and is not referenced by non-DM records. Disguises (an entity known under a false name) are not supported until the perception/context stages (50–60).
- **Uniform absence:** a hidden record or entity is indistinguishable from a nonexistent one, including in errors.
- **No record metadata:** non-DM views omit stream sequence, recording time, actor, and command. They show only knowledge content, scope label, and `knownSince`.
- **As of a world time:** a query can ask what a perspective knew at world time T (records with `knownSince` ≤ T).

## Consequences

- Sharing information (Stage 60 discoveries, Stage 130 dialogue) appends a new record in the receiving scope; it never widens an existing one.
- Later surfaces (memory, entity context, contradictions, AI/NPC contexts, Chronicle) must obtain knowledge only through these perspectives. `docs/GATE_COVERAGE.md` schedules their reviews.
- Historical party membership (who was in the party at time T) is not modeled yet.

## Amendments

- 2026-10-03 (Stage 70, ADR 0014): **valid transitions decided.** Types never change. A holder gains a FACT only through a new, explicitly DM-authored record, which may relate to what it settles. Contradictions are new CONTRADICTION records in the joint holder scope. DM views also show a record's structured `claim`; non-DM views never do.
- 2026-10-27 (Gate 06 remediation, G06-client-01): **semantic IDs only for public identities.** Semantic IDs are only for entities whose identity is public; the client and authoring never generate them for others — an AI proposal's new entities and records get server IDs, derived from its DM-only trace so a repeated proposal collides (`apps/server/src/authoring/opaque-ids.ts`), and every seeded entity a player can meet unnamed has an opaque ID, its kind and eight hex digits or a UUID (`apps/server/src/world-engine/opaque-ids.test.ts`); an ID the DM writes into a command is the DM's own choice.

## Invariants affected

Implements 4, 5, 6 (data scoping only; runtime dialogue is Stage 130), and 7 (no type changes). Preserves 1–3 and 11. No invariant is weakened.
