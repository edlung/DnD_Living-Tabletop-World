**Verdict: PASS**

# Stage 300 checkpoint C, repair 1: bounded re-review (claude-opus-5-5, xhigh)

Repair 1 fixes all seven of my earlier findings at the root, or handles them as owner decisions 6 directs. All required checks pass on the first run, including the integration suite that was flaky last time. There are no Critical, High or Medium findings; three new Low items are below.

## 1. Artifact identity verified

- **Manifest reproduced.** I hashed all 82 listed files in handoff order with `shasum -a 256`. The hash of that output is `7f4c4eb41ae365751990501fdab5464dd0006f07e403d194e476a46e003108dc`, as the handoff claims.
- **Design hashes unchanged.** `docs/STAGE_300_REMEDIATION_DESIGN.md` is `23e53e4d…aab2` and `docs/STAGE_300_B2_STOP_SCOPE_DESIGN.md` is `6bba0030…b485`.
- **Owner decisions 6** is `80dcf4e7…69c3`, matching the handoff.
- **Unchanged since my first review:** the catalog entry, `usage-facts.ts`, `anthropic-provider.ts` and `gateway.ts` hashes are identical to the initial manifest.
- **Offline evidence:** the first offline run directory is unchanged, and the new run `offline-2026-10-12T05-12-17.938Z-ec62c20f` is present.
- **Base commit not checkable:** the snapshot has no git metadata, so I could not verify `e288678`.

## 2. Findings

### Earlier findings, re-verified

- **M1 (intent oracle accepted extra commands): fixed.**
  - My original wrong answers are now rejected: the fishmonger plus Mira's death, the fishmonger plus Orin's move, and an unrelated guard statement ("Луна голубая.").
  - Also rejected: a missing `attributedTo`, another subject, an extra scope key, an unknown field, an extra field on `PlaceEntity`, a paraphrased or `PUBLIC` injection fact, and the guard plus an extra command.
  - Correct answers still pass.
  - `intent-oracles.test.ts` adds controls for these cases (`intent-cases.ts:117-245`).

- **M2 (measured session estimate understated cost): fixed.**
  - A measured sample is now the request's settled charge from accounting (`eval-world.ts:173-188`).
  - Probe: a cache-heavy request settled at 11,900 µ$ gives an estimate of 60 × 11,900. Denied or held requests give no sample.
  - The integration run covers this path: a measured intent of 200 input + 3,000 cache-write + 800 output tokens yields $0.0795 for 5 intents.
  - Runtime totals recomputed: $0.317 to $2.045 ($4.090 at twice the high end); the Sonnet-relevance alternative is $0.250 to $1.350. All correct.

- **L1 (null usage labels accepted): handled per owner decisions 6.** The behaviour is unchanged, now has an explicit test (`catalog-sonnet-5-5.test.ts:214-225`), and is recorded in ADR 0032.

- **L2 (nested request content unchecked): fixed.**
  - `request-shape.ts` runs before any reservation (`pricing.ts:71`).
  - Probe: 18 nested mutations are refused. These include an assistant prefill, block-form user content, a 1-hour or explicit TTL, two system blocks, server, typed or renamed tools, `cache_control` on a tool or inside `input_schema`, and no tool or no message.
  - The adapter's own bodies still reserve 2,520,480 / 2,540,960 / 2,581,920 / 2,622,880 µ$.

- **L3 (no-network proof passed without its setup): fixed by inspection.**
  - Neither proof imports the setup any more; they check the trap's registry symbol, which only `setupFiles` installs.
  - I could not reproduce the implementer's negative control myself: vitest cannot be run without its config here.

- **L4 (timing-sensitive relevance test): fixed.** The test now uses a 3 s budget, asserts the dispatch, and still proves the caller returns at the deadline without waiting for the stalled write. The full integration suite passed on its first run.

- **Info (preflight errors and refusal order): fixed.** Every preflight database read failure now gives `DATABASE_UNAVAILABLE` and closes the pool. The approval-mismatch path is now tested (`eval-live.test.ts`).

### New findings (all Low)

- **R-L1: the relevance decision is enforced by configuration only.** Owner decisions 6 put runtime relevance on the deterministic path. The `.env.example` route has no `fast-context` entry, the default route is empty, and the startup report is pinned by test. However, an operator who sets `fast-context=anthropic:claude-sonnet-5-5` would still get paid ranking, and `gateway.ts` does not refuse it. The ADR discloses that the design's explicit remote ranker "stays possible". The orchestrator should confirm that configuration-level enforcement is enough.

- **R-L2: the dialogue isolation check uses the system's own context builder as its reference.** It decides what is allowed (unlocked guarded content, source IDs) by rebuilding the context with the route's own functions (`oracles.ts:64-69`, `dialogue-runner.ts:33-54`).
  - It does prove the provider input contains nothing beyond what the builder exposed.
  - It cannot detect the builder itself disclosing guarded content in the wrong attitude scenario.
  - Planted secrets and other NPCs' facts are still forbidden unconditionally, and builder correctness stays with the existing Gate 04 tests.

- **R-L3: some lexical and partial checks remain.**
  - A negated guard account ("Караван не ушёл.") passes; the check is lexical and disclosed as such.
  - Extra keys inside `CreateEntity.placement` are not checked.
  - The measured estimate leaves out requests with held attempts. Those may be the slow, expensive ones, though holds are reported separately.

## 3. Checks

| Check | Result |
| --- | --- |
| `pnpm run format:check` | PASS |
| `pnpm run lint` | PASS (exit 0) |
| `pnpm run typecheck` | PASS |
| `pnpm run context-budget` | PASS: 718 active files, 0 over target, 0 over hard limit |
| `pnpm run test` | PASS: 208 files / 2,348 tests |
| `pnpm run build` | PASS |
| `pnpm run db:migrate` | PASS: 0 applied, 8 already applied |
| `pnpm run seed:ravenford` | PASS: 0 accepted, 91 duplicates, version 113 |
| `pnpm run test:integration` | PASS on first run: 33 files / 182 tests |
| `pnpm run test:e2e` | PASS: 49/49 (ports 4310/4311 were free) |

## 4. Probes and outcomes

- **Request shape and reservations (L2):** described above; the allowlist refuses every nested mutation I tried.
- **Intent oracles (M1):** 21 cases, as described above.
- **Measured estimate (M2):** the repaired path uses settled charges and excludes denied and held requests.
- **Dialogue isolation oracle:** it catches a planted secret, another NPC's fact, locked guarded content, source and boundary IDs in the input, missing allowed content, and a source superset or subset. It allows guarded content the builder unlocked and the player's own words.
- **Chronicle model-only verdict:**
  - A valid model chapter passes.
  - A valid model chapter with an uncovered entry fails.
  - A twice-rejected answer is scored `model-rejected` with the causes listed.
  - Local, denied, no-start and template chapters get `pass: null`, never a model pass.
  - A valid repair after a rejection passes, with the rejection kept.
- **Reports and records:** the new offline report shows separated verdicts, "69 of 69" source checks, chapters by authorship, $0.317–$2.045 and the labelled Sonnet-relevance alternative. ADR 0032's "C repair 1" section and the corrected Stage 300 report section match the code.
- **Not rerun:** I did not run the evaluation CLI itself again after last round's permission denial. Its offline and live paths are covered in-process by `eval-run.test.ts` and `eval-live.integration.test.ts`, which pass.

## 5. Residual risks and what I could not verify

- **No live behaviour verified.** Sonnet 5.5 latency, truncation at the chosen efforts, whether API-key traffic carries the usage fields outside the public schema, and the response `model` string are all unmeasured.
- **Operator records are not created yet.** The owner's ceilings in decisions 6 are recorded only after acceptance.
- **Unverified items:**
  - the base commit `e288678`;
  - the implementer's failing-first regressions and the trap negative control;
  - the max-effort reviewer's report, which I cannot see.
