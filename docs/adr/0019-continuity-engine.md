# 0019. Continuity Engine: conflicts, explanations, options, relationships, and lore claims

- Status: Accepted
- Date: 2026-10-04
- Stage: 120; consumed by Stages 130 (disclosure by attitude), 170 (Chronicle), 230 (authoring UX)
- Decision type: product (owner-approved checks, relationship model, and lore) and technical
- Owner approval: on 2026-10-04, before implementation, the owner chose:
  1. the checks and severities in §2;
  2. an NPC's attitude toward the party as the relationship model (§3);
  3. lore as structured claims, including DM claims on world truth (§4).

  These answer the Stage 120 part of Q1 and the relationship part of Q2 in `docs/IMPLEMENTATION_PREREQUISITES.md`.

## Context

ADR 0018 introduced the first continuity guards for AI-assisted authoring. Stage 120 must widen them across time, geography, identity, knowledge, relationships, lore, and relevant rules. It must explain each conflict and offer options without removing a commit guard, silently rewriting the DM's intent, or permitting a partial mutation (`ARCHITECTURE.md`, Continuity Engine). The relevant attacks are ADVERSARIAL B2–B4, C3, and D1–D5. Statements are free text, so a deterministic engine can only compare what is structured (ADR 0014).

## Decision

### 1. Conflicts, explanations, and options

- Every continuity finding is one of:
  - a **blocking issue**, which makes a proposal uncommittable;
  - a **warning**, which the DM may acknowledge (ADR 0018 §4); or
  - a **note**, for information only.
- Each explains itself in a sentence that names the entities, records, and world times involved. Warnings and notes also list related entity and record IDs.
- **Options.** A preview attaches options to every issue and warning:
  - an **edit**: the whole command list of the revision it would create;
  - a **removal**: dropping the operation and the operations that depend on it;
  - an **acknowledgement**, for warnings.
- **Applying an option is an explicit DM act.** `POST …/revisions` with `{ basedOnRevision, optionId }` makes the server recompute the preview of the latest revision against the current world. It stores the option's command list as a new revision, recording the option applied, and previews that revision afresh. An option that no longer exists is a conflict (`409`). Nothing is applied automatically. A new revision still needs its own confirmation, so warnings never bypass a guard.

### 2. Checks (owner decision)

| Domain              | Check                                                                                     | Severity |
| ------------------- | ----------------------------------------------------------------------------------------- | -------- |
| Time                | `KNOWN_AFTER_DEATH`: an NPC would learn something after their death                       | block    |
| Relationships       | an NPC's attitude changes after their death (kernel: `TARGET_DEAD`)                       | block    |
| Time                | `SPEAKER_NOT_ALIVE`: testimony heard from someone already dead at that time               | warning  |
| Time and geography  | `MOVES_THE_DEAD`: moving a dead NPC                                                       | warning  |
| Rules and geography | `ENCOUNTER_HERE`: an NPC appears where a fight is running and does not join it            | warning  |
| Identity            | `RENAME_KNOWN`: renaming an NPC the party or the public knows rewrites their accounts too | warning  |
| Knowledge           | `DUPLICATE_ACCOUNT`: the NPC already holds this account                                   | warning  |
| Knowledge and lore  | `CLAIM_CONFLICT`: a claim disagrees with another account, a clue, or world truth          | warning  |
| Relationships       | `DISCLOSURE_AGAINST_ATTITUDE`: a hostile or wary NPC is made willing to share             | warning  |
| Knowledge and lore  | `CLAIM_AGREES`: a claim agrees with another account                                       | note     |

ADR 0018's checks remain as they were (`KNOWLEDGE_BEFORE_SUBJECT` blocks; `NAME_IN_USE`, `WITNESS_ELSEWHERE`, and `SECRET_SUBJECT` warn), and now have explanations and options.

- **A blocking check is legality.** It only rests on facts the commit records. `KNOWN_AFTER_DEATH` reads the holder's status history, which a knowledge record's footprint does not cover. When a proposal gives knowledge to an existing NPC, the commit therefore records an `AuthoringPremisesRecorded` event (reads only: that NPC's existence and status). Undo cannot then reach beneath it, and re-decision stays exact.
- **Warnings and notes are consent**, as in ADR 0018 §4. They are evaluated when the commit is decided and never re-decided.

### 3. Relationships (owner decision; Q2, relationship part)

- **What it is.** Each NPC has an **attitude toward the party**: HOSTILE, WARY, NEUTRAL, FRIENDLY, or TRUSTED. The default is NEUTRAL; no record means neutral.
- **How it changes.** Only through `SetRelationship { npcId, attitude }`, issued by the DM or the system, directly or through a confirmed authoring proposal (enabled at L2). The event is `RelationshipChanged { npcId, from, to }`, at the current world time. Rejections: a non-NPC is `INVALID_RELATIONSHIP`; a dead NPC is `TARGET_DEAD`; the same attitude is `NO_EFFECT`.
- **What it never does.** It creates no memory, knowledge, or disclosure (ADVERSARIAL B4).
- **Undo** restores the previous attitude. The event reads the NPC's existence and status and writes `relationship:<npcId>`.
- **Who sees it.** It is DM data: no player view shows it.
- **Stage 130** decides how an attitude affects whether an NPC shares a GUARDED record at runtime. That is the second half of Q2, still open. Until then, disclosure follows ADR 0013 §3 unchanged.

### 4. Lore as claims (owner decision)

- **Claims in proposals.** A proposal may set claims on records it adds or on an NPC's records (`SetClaim`, enabled at L2), as ADR 0014 anticipated. Claims on clues are not authored.
- **Claims on world truth.** The DM or the system may set claims on WORLD_TRUTH records, for continuity only (amends ADR 0014 §1).
  - Contradiction detection never compares them: WORLD_TRUTH is never joined (ADR 0014 §2), so players never get a contradiction from them.
  - Like every claim, they appear only in DM views.
- **Comparison.** Continuity compares each claim a proposal sets with every claim on the same subject and aspect, in every scope and on clues:
  - a different value is a `CLAIM_CONFLICT` warning, naming whose account or which truth record disagrees;
  - the same value is a `CLAIM_AGREES` note.

  Free text, such as "a lifelong resident" against an eight-month arrival, is not compared; only claims are.

## Consequences

- **Stage 130** uses attitude for runtime disclosure, and must decide which conditions make a GUARDED record shareable.
- **Stage 230** builds the conflict, option, and acknowledgement UI on these previews.
- **Free-text lore** conflicts stay undetected unless the DM records them as claims.

## Amendments

- 2026-10-04 (Stage 130, ADR 0020 §2–3): an NPC's attitude now changes disclosure (hostile or wary keeps guarded records back; trusted shares them without evidence) and is part of the NPC's own dialogue context, so a reply's tone may reflect it. No player view or outcome shows the attitude itself.
- 2026-10-28 (owner decisions 11, SI-D7): **`WITNESS_ELSEWHERE` no longer offers to place the witness where it happened.** An NPC has one recorded place, where they are now, so "place them there since then" moved them today (Stage 360 stand-in DM, step 09). The warning now says that the world records only where someone is now, not where they were before, and offers "make it a rumor they heard" and acknowledgement; the DM's client adds "Edit the description" (the proposal's editor for an NPC it creates, the NPC card's edit for one already in the world, ADR 0029 amendment 2026-10-28). Modelling past whereabouts is future work (after v0.1).
- 2026-10-28 (review of owner decisions 11): `NAME_IN_USE` names the other entities by name with where each one is, never by ID (IDs are opaque since Gate 06). `RENAME_KNOWN` also warns when a single character knows the NPC by name ("… is known by name to Elowen Starwhisper"), since that character's accounts change too.

## Invariants affected

Implements 7 (claims structure lore without changing any record), 11, 16, and 17 for continuity; preserves 1–6, 12, and 13. No invariant is weakened: options never apply themselves, and warnings never cover a blocking issue.
