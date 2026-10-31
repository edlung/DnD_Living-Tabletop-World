# Stage450 live campaign handoff

- Gate: authorized live continuation of Stage450.
- Type: INITIAL live evidence supplement after the offline checkpoint.
- Base: `309616f`; branch: `codex/stage-450-campaign-integration`.
- Session: the selected session model; no separate approval role.
- Authority: `reviews/OWNER_LIVE_CAMPAIGN_AUTHORIZATION_2026-10-30.json`;
  implementation scope: `work-orders/STAGE_450_LIVE.md`.
- Design: accepted Stage370 / ADR0038; unlimited monetary policy remains explicit.
- Report: `reports/STAGE_450_LIVE_RESULT_2026-10-30.md`.
- Evidence: `reports/evidence/stage-450-live-2026-10-30/index.md`.
- Status: **TECHNICALLY_VERIFIED / AWAITING_OWNER_DISPOSITION / HUMAN_ACCEPTANCE_PENDING**.

## Objective and authority

Run one real private campaign through the admitted Anthropic preparation path,
record quality, cost and timing, fix discovered pipeline defects and show the
result through the ordinary scenario/visual preview. Follow
`ARCHITECTURE_INVARIANTS.md`, `AGENT_WORKFLOW.md`, `docs/PROJECT_WORKFLOW.md` and
the current live work order. No later stage, canonical activation, paid image
generation, default database mutation, credential change or deployment is included.

## Result and scopes

«Маяк под водой» uses actual `claude-sonnet-5-5` output. Seven GENERATE requests
and one directed EDIT request settled for $0.661081 with zero open holds. The
original generation omitted its cast. AI repair supplied the entities; five clue
method/DC corrections and six initial placements were then saved explicitly as
OWNER revisions2–3. Revision3 is READY, with thirteen locations and three complete
prepared characters. Raw responses, failed revision1 and the EDIT candidate remain
unchanged. No post-fix live GENERATE was run; native repair was verified separately
through an admitted-PG injected-transport regression.

The paid ledger is retained in its named isolated database. Its temporary owner
preparation grant is disabled. The local preview stand has no provider keys and
only local routes. OWNER may inspect scenario, characters and prepared encounters;
each CHARACTER sees its restricted projection. All three real SECRET statements
were absent from all three character preview responses. Canonical streams/events:0.

## Reproduce and validation

- The actual full-check command is
  `node --conditions=@ltw/source --experimental-strip-types /private/tmp/ltw-stage450-live-validate.mjs`.
  It supplies an isolated temporary database to `pnpm validate`, forces local
  providers and drops only that temporary database in `finally`. Never point this
  verification at the default or retained paid-ledger database.
- Focused regressions cover generation schema/semantics, shared clue-target rules,
  physical cast placement and actual-PG bounded native repair/accounting.
- Read-only UI runner:
  `/private/tmp/workshop-stage450-live-ui-qa-r3.mjs`. A fresh owner invitation is
  supplied over stdin, never stored in evidence or command arguments.
- Final revision3 UI:36 state/width combinations,72 visually inspected PNGs;
  zero layout, axe, overflow, console or private-owner-traffic findings in CHARACTER.
- Full final validation: **PASS**, exit0. 3,395 unit tests/373 files,
  341 PostgreSQL tests/60 files and184 browser tests passed. Context budget:
  1,475 active files, zero over target/hard limit. Format, lint, types, build,
  isolated migrations and seed passed. The temporary validation database was
  dropped. Transcript: live evidence `logs/validation.green.log`.

## Adversarial pass and limits

Empty completed casts, unresolved party references, incomplete sheets, wrong
levels/counts/starting locations, illegal clue targets and unplaced active physical
cast are rejected with bounded repair feedback. Ordinary owner-authored offstage
entities remain legal. The admitted-PG regression proves the second cast attempt
receives semantic feedback and settles both attempts without canonical events.
The live sample proves real transport/accounting and isolated preview; it does
not prove that a newly generated campaign will always pass on its first attempt.

The refreshed actual-PG visual audit verifies NPC occupancy, neutral-art fallback,
static prepared battlefield and owner/character privacy. Revision2's earlier
screenshots remain separate historical evidence. No AI illustrations were requested.
Human product acceptance and narrative preference remain the owner's disposition.
Earlier frozen Stage450 reports/manifests are unchanged.

Package manifest: `reports/evidence/stage-450-live-2026-10-30/package.sha256`,
238 verified entries; SHA256:
`719b87926eebf2016afcb1e790bcb851fb02cef4b24531f3939ef7d76b190944`.
This handoff is excluded from the manifest to avoid self-reference.

Required output: the linked live report and manifest. Stop after delivery for the
owner's disposition; do not infer human acceptance.
