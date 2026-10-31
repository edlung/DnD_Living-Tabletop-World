# 0038. AI campaign workshop: drafts, previews and confirmed bootstrap

- Status: Proposed; awaiting the owner's Stage 370 disposition.
- Date: 2026-10-30.
- Stages: 370 (contract), 380–450 (implementation and acceptance).
- Type: product and architecture; preserves `ARCHITECTURE_INVARIANTS.md`.
- Contract: `docs/STAGE_370_DESIGN.md`; scope: `work-orders/STAGE_370.md`.

## Owner instructions

In the current project chat the owner requested AI generation of campaigns with
both visual and scenario previews. The owner then instructed:

> правка по AI-бюджету. Сними их. Бюджет пока неограничен.

The later instruction, «выполняй реализацию всех этапов», authorizes the proposed
Stage 370–450 program. Those product requirements are direct owner instructions.
The detailed architecture below is proposed for disposition; it is not an
approval issued by the session. Existing checkpoint stops still apply.

## Context

The kernel can create independent campaign streams, but production users cannot
create a whole campaign through the HTTP command route. In-play authoring is
deliberately limited and cannot initialize a full campaign. Credentials are bound
to an existing campaign, paid preparation is currently local-only, image lineage
assumes canonical subjects, and quest content is configured at the server level.

The new feature must work before a live campaign exists. Previewed secrets cannot
leak to a selected-character view, draft changes cannot rewrite played history,
and AI output cannot acquire authority merely because a compiler accepts it.

## Proposed decisions

1. Introduce an operator-invited workshop owner/session independent of campaign
   memberships. Owner-qualified routes protect all drafts, jobs, histories,
   pictures, progress channels and campaign ownership links. Player/DM membership
   credentials never acquire workshop authority implicitly.
2. Store immutable, schema-versioned campaign packages with stable opaque object
   IDs and provenance. Separate current facts and typed scoped knowledge from
   future scenario plans. Quest definitions are immutable content per campaign;
   quest progress continues to be derived from effective played history.
3. Build one pure compiler over supported World Engine decisions. Reuse it for
   readiness assessment, isolated preview materialization and confirmed startup.
   Do not widen the existing `ApplyAuthoring` permission/operation limits to
   accommodate whole campaigns.
4. Add durable, resumable preparation jobs through server-side capability routing.
   Persist attempts/results and fence workers. Reject stale writes. An uncertain
   provider dispatch remains uncertain; retries cannot silently claim no charge.
5. Add a real preparation session/capability rather than faking active play. In
   Stage 380, implement the owner's unlimited monetary policy explicitly in stored
   authorization for owner-authorized text and image calls. No account/day/stage/
   campaign/session monetary ceiling applies in this mode. Preserve historical
   finite approvals, metering, unknown costs and settlements. Keep authentication,
   provider allowlists, operational stops, concurrency, timeouts and bounded retry.
6. Render scenario and visual previews from the same revision. Reuse scoped server
   projections and world rendering. Player preview must never receive an owner
   package with client-side secret filtering. Preview navigation creates no real
   discoveries, travel, memories, Chronicle or campaign events.
7. Give draft images their own lineage and owner authorization. Record source
   revision, selection and hash. Flag stale pictures, preserve unaffected choices,
   and adopt exact chosen bytes into the new campaign without regeneration.
8. Support manual/AI edits, locks, dependency-aware diffs and restore-as-new-version.
   No result overwrites later edits. Each content or selected-image change
   invalidates confirmation of the earlier package.
9. Introduce a dedicated user-confirmed bootstrap World Engine command with pure
   validation and one atomic initial event batch. Bind consent to the stored
   revision, compilation digest and visual manifest. Provisioning/publication is
   idempotent and closed to play until consistent; restart reconciles the same
   campaign. Preserve provenance, replay, assets and campaign content in backups.
10. Confirmed startup establishes the owner as DM and uses existing invitation/
    membership rules for players. Bulk reversal after play is not proposed;
    normal command-level safe undo remains. A later draft edit cannot change
    an active campaign. Text-only activation requires an explicit owner choice.

## Alternatives considered

| Alternative                                         | Reason not chosen                                                                                        |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| One large prompt that returns prose only            | Cannot prove that images, scene objects, knowledge and playable state refer to the same reviewed content |
| Ordinary in-play proposals for the whole campaign   | Exceeds intentional operation/size restrictions and lacks atomic initial creation                        |
| Direct database import of generated seed commands   | Bypasses confirmed authoring, validation, provenance and partial-publication guarantees                  |
| Live campaign as a preview sandbox                  | Can pollute played history, invitations, asset jobs, paid sessions and discoveries                       |
| Send the full draft and hide secrets in the browser | Violates the knowledge boundary even when the UI appears correct                                         |
| Huge numeric spending ceiling                       | Misrepresents the owner's unlimited policy and eventually blocks valid work                              |
| Remove accounting with spending limits              | Loses actual charges, uncertain dispatch evidence and provenance needed for recovery                     |

## Protected deltas and compatibility

These decisions require additive implementation amendments to ADR 0018 (separate
initial authoring scope), ADR 0025 (campaign-owned definitions), ADR 0032
(unlimited monetary policy and preparation eligibility), ADR 0035 (draft images
and adoption), and ADR 0036 (workshop credentials and campaign entry).
Their historical evidence stays unchanged. Existing runtime limits remain in
effect until Stage 380 implements and verifies the new policy.

No architecture invariant is weakened. Invariants 1–3 and 16–18 govern activation;
4–7, 19 and 20 govern content/projections; 8–10 remain the rules engine's authority;
11–14 govern identity/history/visual lineage; 15 forbids stored quest progress as
truth; 21–23 keep capability interfaces, server-side providers and the monolith.

## Verification and disposition

Stage-specific acceptance and migration obligations are in the detailed contract
and `docs/GATE_COVERAGE.md`. Stage 370 verifies the design/example only. None of
the future routes, monetary changes, providers, previews or activation paths are
reported as implemented or tested by this ADR. Its status changes only after
the owner disposes the Stage 370 handoff.

## Amendment 2026-10-31: Gate 07 remediation

The owner disposed Gate 07's four Medium findings «Да, исправить», with a moderate job bound and a
separate picture grant (`reviews/OWNER_GATE_07_DISPOSITION_2026-10-31.json`; scope
`work-orders/GATE_07_REMEDIATION.md`; report `reports/GATE_07_REMEDIATION.md`).

- **Paid job bounds (G07-01).** Under UNLIMITED, "concurrency remains in force" now covers queued
  work, not only requests: an owner holds at most one active generation or edit per draft and two in
  all, and four active pictures (`apps/server/src/workshop/job-limits.ts`). The bound is counted in
  the enqueue transaction under the draft lock and a per-owner advisory lock; a refusal is the fixed
  429 and records nothing. The serial workers take each owner's oldest waiting job in turn.
- **Picture grant (G07-02).** UNLIMITED images admit no owner by themselves: paid pictures need the
  owner's latest `ltw_workshop_picture_grants` revision enabled (`pnpm ai:operator picture-grant`),
  checked when pictures are offered (`NO_GRANT`), when a job is queued and when its charge is
  reserved. Migration 0024 granted it to owners whose latest text preparation grant was enabled.
- **Opaque quest identifiers (G07-03).** Quests and their stages get server identities like entities
  (migration 0023; public forms `q-` and `s-` with 32 hex digits): quest logs reach players, and an
  authored slug can state a plot point. A revision saved before them is refused for activation
  (`QUEST_IDENTITIES_MISSING`) until saved again. The engine's bootstrap command keeps its identity
  shape: its plan never publishes quests, which the server freezes from its own plan. Campaigns
  activated before this amendment keep their authored quest keys.
- **NPC disclosure default (G07-04).** An NPC-held record without `disclosure` stays GUARDED, the
  engine's default; the owner's editor shows "Guarded (default)".
