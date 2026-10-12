# Stage 300 — Live AI

- Date: 2026-10-05 (Europe/Oslo). Status: **IMPLEMENTED; OWNER CHOICE OF THE NPC-DIALOGUE MODEL PENDING.**
- Work order: `work-orders/OPUS_STAGE_300.md`. Builder: Claude Sonnet 5.5. Decisions: ADR 0032.
- Owner inputs: keys in `.env.local` (Anthropic, DeepSeek, OpenRouter). No explicit $30 text-provider
  spending approval is recorded. Silence was incorrectly treated as approval in the original report.
  The owner's $20 limit applies to the OpenRouter key for images, not Anthropic or DeepSeek.

## Status correction (2026-10-11)

The implementation and measurements below describe revision `bc6c116`; they are not independent
checkpoint acceptance. Stage 300 acceptance is pending. No further paid text evaluations are authorized
by the reported $30 figure. The ledger is an in-memory, post-response estimate: concurrent calls can
overshoot, restart resets it, and missing/error usage is not accounted. It is not a strict spending cap.
Required per-campaign ceilings and computed cost on every trace attempt are still missing. Independent
review of the implementation returned technical FAIL before dependent Stage 310 implementation.
See `reviews/STAGE_300_AUDIT_DISPOSITION_2026-10-11.md` for findings, model-evidence limits and the
pending remediation design. No source fixes or new live measurements are included in this correction.

## What changed

Claude adapter fixed (forced tool use is a 400 on current models); DeepSeek adapter; per-capability routes
(`LTW_AI_ROUTES`); a fail-closed daily spending ledger; `.env.local` loaded by the server scripts;
the intent prompt tells a model to answer a non-game request with an empty list; the evaluation harness
(`pnpm eval:ai`, `apps/server/src/testing/eval/`). Unit tests cover the adapter, routes, and ledger without network.

## Evidence

Live run of 2026-10-05 (`reports/evidence/stage-300/eval-report.md`, raw `eval-results.json`). Total spend of
all evaluation runs, including reruns: about $1 (ledger prices). Estimated cost of a 45-minute session
(about 60 NPC replies, 5 DM intents, 2 chapters, 100 rankings): Sonnet dialogue ≈ $0.45, DeepSeek dialogue ≈ $0.23.

## Owner decision needed

Read `reports/evidence/stage-300/blind-npc-dialogue.md` (18 pairs, labels hidden) and say which voice you prefer;
the key is in `blind-key.json`. Then set `LTW_AI_ROUTES` accordingly (`.env.example`).

## Limitations

- One run per case; no repeats, so pass rates show sanity, not statistics. Latency is from one machine and evening traffic.
- No ceiling per campaign (ADR 0032 §4). The live path is not covered by hosted CI (no keys there, by design).
- Sonnet 5.5 declines names in Chronicle prose despite the instruction; the Russian checks do not catch it.
- The client has no streaming or "replying" indicator beyond the existing resolving notice.
- OpenRouter is for images (Stage 330) and is not wired yet.

Stop here; Stage 310 requires explicit owner authorization.

## Remediation checkpoint C (2026-10-12) — corrected report section

Status: **implemented offline; awaiting independent acceptance** (`handoffs/STAGE_300_CHECKPOINT_C_REQUEST.md`).
Design: `docs/STAGE_300_REMEDIATION_DESIGN.md` (SHA256 `23e53e4d…aab2`) and the B2 stop-scope delta;
decisions: ADR 0032 amendment of 2026-10-12. This section supersedes the reading of "Evidence",
"Owner decision needed" and the client limitation above; the text above is kept as history.

**Historical baseline (2026-10-05, revision `bc6c116`): structural only.** The 6/6 intents, 18/18
NPC replies, Chronicle and relevance results in `reports/evidence/stage-300/` show that providers
answered and output parsed with no listed marker verbatim. Their predicates could pass wrong outputs
(ADR 0032 correction of 2026-10-11), so semantic correctness, safe declines and quality of those runs
are unverified. Their cost figures ("about $1", "$0.45 / $0.23 per session") came from the removed
in-process ledger's prices and are not verified charges. The blind NPC comparison is closed: the owner
chose Sonnet 5.5 directly and waived it (decisions 2 of 2026-10-11); its historical files are not
evidence of a preference.

**Remediated offline evidence (no live result).** Nothing in checkpoint C called a provider:

- The verified Sonnet 5.5 catalog entry exactly as recorded in
  `reviews/STAGE_300_CATALOG_VERIFICATION_CLAUDE_SONNET_5_5_2026-10-12.md`, with its reservation
  (2,540,960 µ$ at 4,096 output tokens), fail-closed usage and model checks, and the request each
  capability sends (`apps/server/src/ai/catalog-sonnet-5-5.test.ts`); zero outbound requests and no
  key read without an approval, a store, a key or an active play session
  (`gateway-verified.test.ts`); every Vitest project traps the global `fetch`.
- Exact evaluation oracles with negative controls (`intent-oracles.test.ts` and `oracles.test.ts`
  in `apps/server/src/testing/eval/`): exact intent command lists, a Chronicle verdict for
  model-authored prose only (rejected model answers counted with their causes), and the Gate 04
  replay (five lines, five intents, four attitude/disclosure scenarios) with the provider input
  checked against the context builder's sources. The live evaluation path end to end over a
  throwaway database and a fake Sonnet transport (`eval-live.integration.test.ts`: refusals,
  evaluation session class with the run ID, run directory, model identity, known charges, a held
  attempt, model Chronicle failures, a measured estimate from known charges), and the offline CLI
  (`eval-run.test.ts`). Offline runs of the deterministic local providers are recorded under
  `reports/evidence/stage-300-offline/` (see the handoff for the directories); they are not live
  measurements and their technical provider success is zero by construction.
- Client feedback journeys: `tests/e2e/ai-feedback.spec.ts` (replying states, honest unavailable
  answers, null trace IDs never used as authoring sources, a late reply discarded).

**45-minute session estimate for the runtime configuration — an estimate, not a measured bill.**
Owner decisions 6: Sonnet 5.5 serves DM intents, NPC dialogue and Chronicle; relevance ranking stays
on the deterministic Context Engine with no paid model. Disclosed workload: 60 NPC replies, 5 DM
intents, 2 chapters, 100 rankings, at the verified prices with assumed (not measured) token ranges
(`apps/server/src/testing/eval/session-estimate.ts`): $0.317 to $2.045 (rankings $0), up to $4.090 if
every paid request cost twice its high end. Alternative, not the runtime configuration: Sonnet 5.5
relevance would add $0.250 to $1.350 for the 100 rankings. Known charges: none (no live run).
Outstanding holds: none. Unknown: actual token counts and repair rates until a live evaluation
measures them; a measured basis uses each request's known charge, all billed input classes included.

**Capacity disclosure.** Each admitted paid attempt holds the full 1,000,000-token context plus its
`max_tokens`: $2.540960 (NPC reply) to $2.622880 (chapter) until settled. Player and DM requests share
one session, campaign, stage and account capacity. A post-dispatch timeout keeps its full hold until
operator reconciliation; with relevance deterministic at runtime, rankings take no hold. The owner's
ceilings (decisions 6: $30 stage, $15 global daily, $15 Ravenford daily, $10 per play session, $10
per evaluation run) admit at most a few concurrent holds per session.

**Still pending.** Recording those operator ceilings through the operator CLI after acceptance,
independent acceptance of checkpoint C, and a separately authorized live evaluation (owner
decisions 5: not authorized). Quality and NPC voice remain human judgments; lexical checks are
lexical only. No streaming.
