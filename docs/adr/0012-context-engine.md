# 0012. Context Engine: perception, entity context, actions, legality, relevance

- Status: Accepted
- Date: 2026-10-03
- Stage: 50; extended by Stages 60, 80, 90, 140, 210
- Decision type: product (requires owner approval)
- Owner approval: approved as written by the owner on 2026-10-03, before implementation

## Context

Pillar 1 ("World as Interface"): selecting an object yields its context and relevant actions. `RAVENFORD_SPEC.md` (Critical Context Contract) requires visible state plus contextual actions, with legality kept separate from relevance. Example: Healing Word `legal: true, relevance: high`; an illegal spell with `reason: OUT_OF_RANGE` and `resolution: { moveRequiredFt }`. Invariants 5 and 9 require that context exposes only permitted information and that Rules, not heuristics, decide legality. Invariant 20 keeps legal suboptimal choices legal. `docs/GATE_COVERAGE.md` (rows 50–60, Gate 02) forbids secrets leaking through actions, reasons, relations, or hypotheses.

Until now, non-DM perspectives learned that entities exist only through knowledge and memory (ADRs 0008, 0010). A context needs **perception**, which is new.

## Options considered

1. **Context from canonical state, with fields hidden afterward.** Easy to leak.
2. **Context only for known entities.** Players could not notice anything new in the world.
3. **Explicit perception plus knowledge, with whitelisted views. Relevance computed only from the acting perspective's own data.** Chosen.

## Decision

### Acting character

- A context is always computed for an **acting character**: `PLAYER` (the requesting player's character) or `CHARACTER:<id>`. `CHARACTER:<id>` may be requested by that character's player or by the DM (preview).
- Other perspectives (DM, PARTY, PUBLIC, NPC) have no acting character, so they cannot request a context.

### Perception

The acting character perceives:

- entities placed at its current location;
- that location itself, its parent location, and its child locations.

Further rules:

- A perceived entity the character does not _know_ (through visible knowledge or memories, ADRs 0008 and 0010) is shown by kind only, with no name. Concealment and disguises are not modeled yet.
- Dead or destroyed status is perceivable for entities that are present.

### Selectable entities

- An entity is selectable if it is perceived or known.
- Anything else is "not found", exactly like a nonexistent entity.
- A known but absent entity has `present: false` and never reveals where it is.

### Visible state (whitelist)

| Field                    | Shown for                                                          |
| ------------------------ | ------------------------------------------------------------------ |
| ID, kind                 | Every selectable entity                                            |
| Name                     | Known entities only                                                |
| `present`                | Every selectable entity                                            |
| Status                   | Perceived entities only                                            |
| Hit points (current/max) | The acting character and party members only                        |
| Distance                 | Only when canonical battlefield positions exist (combat, Stage 80) |

Canonical descriptions, placement of absent entities, sheets of others, and DM data are never shown.

### Actions

Actions are descriptors; executing them is later stages' work. Each action has an `id`, `legal`, an optional `reason` and `resolution`, `relevance` (high, medium, low), and optional `hints`.

**Catalog for the slice:**

- **Creatures:**
  - Talk; Trade; Inspect.
  - Ask about `<topic>`.
  - Recall (when visible memories involve the target).
  - Insight check.
  - Healing Word and Hunter's Mark on creatures.
  - Longbow attack.
- **Objects and features:** Inspect; Investigate; Perception check; Detect Magic; Recall.
- **Locations:** Inspect; Recall.

**Legality** comes from `@ltw/rules` (ADR 0011), using the canonical sheet and resources.

- **Absent targets:** `NOT_PRESENT`.
- **Dead targets:** they cannot be talked to or traded with (`TARGET_DEAD`).
- **Trade** is an _attempt_: it is legal with any present, living NPC. Whether the NPC agrees, and on what terms, is decided when trading is executed (later stage). No merchant role or economy is invented here.
- **Outside combat** (no canonical positions): range is not evaluated. Ranged actions on present targets are legal, with the hint `RANGE_NOT_TRACKED`.
- **In combat**, range and `moveRequiredFt` come from the rules with canonical positions (Stage 80). Clients never supply positions.

**"Ask about" topics:**

- Only entities the acting perspective knows. Never derived from what the NPC knows: offering a topic because the NPC holds a secret would leak the secret.
- At most five topics per target.

**Relevance** is deterministic, uses only the acting perspective's visible data, and never changes legality:

| Relevance | Rule                                                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| High      | Ask about a topic the perspective has an open question (UNKNOWN or HYPOTHESIS) or a rumor about; Healing Word on a wounded present ally; Recall with memories about the target |
| Medium    | Talk to present NPCs; topics that share a visible record with the target; Inspect, Investigate, or Perception on present objects and features                                  |
| Low       | Everything else that is legal, including attacking someone who is not hostile (legal under invariant 20)                                                                       |

A later AI ranker (Stage 140) may refine relevance using the same scoped inputs only.

### Not in Stage 50

- Executing actions (EnterLocation, conversations, checks): Stage 60 and later.
- Executing a trade. No economy or inventory model exists yet; it needs its own owner-approved decision.

## Consequences

- A new package `@ltw/context` composes domain (state, knowledge, memory) and rules. It is pure and may not import AI or persistence code.
- Module boundaries (amends ADR 0004): `@ltw/context` may depend on `@ltw/rules`, `@ltw/domain`, and `@ltw/contracts`; `@ltw/server` may also depend on `@ltw/context`. No existing edge changes.
- HTTP: `GET /campaigns/:campaignId/entities/:entityId/context?perspective=…` follows the ADR 0009 check order and returns a uniform 404 for anything not selectable.
- Gate 02 reviews these paths: actions, reasons, topics, and relevance must not reveal secrets.

## Amendments

- 2026-10-04 (Stage 90, ADR 0016 §4): while a reaction window is open, combat actions are illegal with `REACTION_PENDING`. A pending candidate who selects the window's caster sees `counterspell`, first among creature actions, relevance high; its legality and cost (slot level) come from the same Counterspell eligibility the World Engine applies. Nothing in a context names the suspended spell.
- 2026-10-04 (Stage 80, ADR 0015 §6): when the acting character is a combatant, legality comes from `@ltw/combat`'s shared legality with the encounter's positions and turn: distance between combatants, range with `moveRequiredFt`, cover, and turn reasons. Creatures in the encounter gain a `fireball` action centered on them, with `area.affected` (perceived combatants, the caster included) and the hint `ALLY_IN_AREA`; `longbow_attack` may carry `LONG_RANGE`. A target outside the encounter is `NOT_IN_COMBAT`. Outside combat nothing changes.
- 2026-10-03 (Stage 70, ADR 0014 §5): CONTRADICTION counts as an open question for relevance. Only the perspective's visible records are used.
- 2026-10-03 (Stage 60, ADR 0013 §5): locations gain `enter_location` (`ALREADY_HERE`); evidence checks report `ALREADY_ATTEMPTED` and need a sheet (`NO_CHARACTER_SHEET`). Perception moved into `@ltw/domain` so the World Engine validates player commands with the same rule.

## Invariants affected

Implements 5 and 9 for context. Preserves 4, 8, and 20 and the ADR 0008 and 0010 boundaries. No invariant is weakened.
