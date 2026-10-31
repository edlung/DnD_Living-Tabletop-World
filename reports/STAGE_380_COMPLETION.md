# Stage 380 — Workshop access and unlimited monetary policy

- Date: 2026-10-30.
- Status: **CHECKPOINT_READY / AWAITING_OWNER_DISPOSITION**.
- Branch: `codex/stage-380-workshop-access`.
- Base: `166bd47` (reviewed Stage 370 contract saved as a local commit).
- Authority: `reviews/STAGE_370_OWNER_DISPOSITION_2026-10-30.json`.
- Scope: `work-orders/STAGE_380.md`; detailed implementation: `docs/STAGE_380_DESIGN.md`.
- The selected session model implements and verifies this stage; narrow helpers
  inherited that same model. No separate writer/reviewer or approval role was assigned.

## Implemented behavior

Workshop access no longer depends on an existing campaign. An operator issues a
single-use link for a new or existing owner. Redemption creates an independently
scoped HttpOnly workshop cookie. The owner can create and list private draft
containers with titles/languages; paging keeps all authorized drafts reachable.
Retrieving another owner's draft is indistinguishable from an unknown draft.

The browser clears invitation fragments before requests, waits for deliberate
entry, asks before replacing its workshop login, and keeps campaign sign-in
independent. Reload, sign-out confirmation, revocation and history restoration
are covered. Draft requests bind the owner the screen actually shows, so another
tab replacing the cookie cannot apply old private input under the new owner.

Monetary policy now has explicit append-only `UNLIMITED` revisions for text billing
accounts and the installation image ledger. It bypasses every numeric monetary
bucket and valid monetary-overrun stop while retaining identity/session/approval
eligibility, unknown charges, billing/model discrepancies, reservations, settlement
and restrictive operational stops. Every new reservation identifies its selected
policy revision; finite history stays unchanged and readable. Reports distinguish
unlimited mode from a missing policy. Startup and the image-smoke preflight no
longer misinterpret an unlimited null ceiling as a refusal.

## Main changed surfaces

| Area                           | Entry points                                                                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner authorization            | `reviews/STAGE_370_OWNER_DISPOSITION_2026-10-30.json`; current workflow, accepted ADR index and Stage 380 work order/design                               |
| Shared API contracts           | `packages/contracts/src/workshop/access.ts`, public index                                                                                                 |
| Workshop HTTP/cookies/operator | `apps/server/src/workshop/` (`routes`, `cookies`, `service`, `operator`, `operator-cli`)                                                                  |
| Durable workshop storage       | `workshop/postgres-store.ts`, migration `0015_workshop_access.sql`; owner-qualified containers and one-way credential/audit history                       |
| Test reference store           | `apps/server/src/testing/workshop-store.ts`; excluded from production builds                                                                              |
| Composition                    | `apps/server/src/http/app.ts`, `main.ts`; workshop routes wired beside invitation-mode sign-in only                                                       |
| Browser                        | `apps/web/src/workshop/`, main entry, workshop stylesheet and Russian access dictionary                                                                   |
| Browser fixtures/journeys      | `testing/ui-workshop-{fixtures,links}.ts`, invitation UI test server; `tests/e2e/workshop-access.spec.ts`, `workshop-accessibility.spec.ts`               |
| Monetary policy                | `ai/accounting/monetary-policy.ts`, migration `0014_ai_unlimited_policy.sql`, admission/settlement/reconciliation/stop diagnostics/operator/spend reports |
| Image accounting               | `images/ledger.ts`, extracted ledger lock, image-smoke preflight and regression                                                                           |
| Operator/setup documentation   | Root/server package scripts, README, local AGENTS, context map, deployment spend-status wording                                                           |

## New routes

`POST /workshop/auth/redeem`, `GET /workshop/auth/session`,
`POST /workshop/auth/sign-out`, `GET/POST /workshop/drafts`,
`GET /workshop/drafts/:draftId`. The reverse proxy's existing `/api` prefix applies.
Responses are no-store and vary on Cookie; the optional `x-workshop-owner` draft
header returns a fixed 409 when a mounted owner changed, without clearing the new
session. Malformed inputs, unauthenticated requests and hidden IDs keep fixed errors.

The browser-test revoke trigger exists only in the testing composition. It is not
a production route or operator shortcut. There is no workshop progress stream yet;
Stage 400 must reauthorize it against the same durable session on each cycle.

## Operator commands

```sh
pnpm workshop:operator invite --expires-hours 24 --authorization-source <owner-reference>
pnpm workshop:operator invite --owner <uuid> --expires-hours 24 --authorization-source <owner-reference>
pnpm workshop:operator revoke --owner <uuid> --authorization-source <owner-reference>
pnpm ai:operator monetary-policy-set --scope text --account <id> --mode unlimited --owner <owner> --authorized-on 2026-10-30 --authorization-source <owner-reference>
pnpm ai:operator monetary-policy-set --scope images --mode unlimited --owner <owner> --authorized-on 2026-10-30 --authorization-source <owner-reference>
```

The workshop commands require invitation mode/public origin and print a new link
once. Unlimited policy requires explicit durable authorization; no environment
flag, absent numeric row or fabricated large number grants it. Status/spend
commands show its metadata. An explicit finite revision restores historical caps.

## Adversarial pass and fixes

| Probe                                                                   | Result / evidence                                                                                                    |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Valid game cookie reads workshop; workshop cookie reads a real campaign | Refused; real invitation-mode composition test and browser coexistence journey                                       |
| Keep game login while joining/leaving workshop                          | Game session remains usable and its cookie is not cleared                                                            |
| Another owner reads draft or uses its pagination cursor                 | Same fixed 404 as absent; private shelf and bytes contain no other owner's content                                   |
| Repeated/lost create response                                           | Same owner/request ID yields one draft; changed content conflicts; HTTP/PG/browser coverage                          |
| Invitation reuse, expiry, forgery, owner revoke                         | Fixed refusal; PostgreSQL owner lock serializes redeem/revoke and one session spends a link                          |
| Claim a session under another invitation owner                          | Composite FK rejects it; immutable credentials/ownership/revocation history also reject rewrites/truncation          |
| Cross-origin mutation or session probe                                  | Fixed refusal before cookie clearing; origin and secure/strict/path attributes checked                               |
| Hidden credential in response/log/URL/storage/history                   | Hash-only storage, fixed storage errors, explicit log scans; browser fragment removal and history lifecycle coverage |
| Old tab creates under a newly selected owner's cookie                   | Found during integration review; expected-owner header now prevents the mutation and old privileged UI is discarded  |
| More than 50 private drafts                                             | Keyset paging and Load more reach all 51 without duplicates; HTTP/browser tests                                      |
| Exceed account/day/stage/campaign/session/run/image money ceiling       | Explicit unlimited policy admits; real/unknown usage and policy references remain; finite-mode regressions retained  |
| Forged/malformed billing/model stop                                     | Still refuses; valid monetary overrun alone is superseded with operator-visible explanation                          |
| Null unlimited image ceiling mistaken for no budget                     | Startup warning and image-smoke preflight corrected; new smoke regression first failed with refusal and now passes   |
| Layout/keyboard/long Russian names                                      | 1440/768/390/320 invitation/shelf/sign-out inspection and measurable audit; no overflow or alignment findings        |

An additional history-snapshot regression initially returned both the private
draft title and shelf in the same synchronous `pagehide` dispatch. The browser now
flushes the private subtree removal before the history snapshot; both booleans
are false after the fix. Evidence: `reports/evidence/stage-380/pagehide-red.json`
and `pagehide-pass.json`. The existing lifecycle journey includes this assertion.
The full suite passed again after this material fix; its result is not inferred
from the earlier passing candidate.

No live AI provider was called. In-memory test stores and fixture grants are not
production authority. The code keeps the World Engine and campaign auth boundaries
unchanged; drafts are workshop metadata, not canonical world mutations.

## Verification

Final `pnpm validate` passed with exit 0 in an isolated throwaway PostgreSQL
database with local text providers, placeholder images and explicit blank key
overrides. Its database was dropped after completion. Transcript:
`reports/evidence/stage-380/validation.txt`; reproduction runner:
`reports/evidence/stage-380/validation-runner.txt`.

| Check                                                 | Final result                                                                                 |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Full `pnpm validate`                                  | PASS, exit 0, repeated after synchronous pagehide fix                                        |
| Formatting, lint, typecheck                           | PASS                                                                                         |
| Context budget                                        | PASS: 1,131 active files, none above target/hard limit                                       |
| Unit tests                                            | PASS: 3,016 tests in 306 files                                                               |
| Build                                                 | PASS; existing minified-chunk warning remains                                                |
| Migrate and seed                                      | PASS on the throwaway DB; 91 accepted seed submissions, 51 curated picture imports           |
| Integration tests                                     | PASS: 254 tests in 44 files                                                                  |
| Chromium journeys                                     | PASS: 144 tests, including 12 new workshop journeys; final run 4.9 minutes                   |
| Layout audit                                          | PASS: 12 state/width combinations, zero errors/warnings; reviewed shared-spacing information |
| Private-history synchronous regression                | RED before fix; PASS after; final full suite includes the strengthened assertion             |
| Final documentation formatting, build and diff checks | PASS                                                                                         |

Artifact hashes are in `reports/evidence/stage-380/package.sha256`, excluding
itself and the handoff. The handoff identifies the manifest; verify entries from
the repository root with `shasum -a 256 -c`.

Focused evidence already passed: 100 accounting/image integration tests across
11 files; 30 monetary unit tests; 6 workshop PostgreSQL tests; workshop/operator
and campaign-cookie HTTP regressions; 14 image-smoke unit cases; 6 client
start/dictionary cases; 12 new browser journeys including keyboard/axe, paging,
revocation, stale-tab identity and response-loss behavior. Layout audit and all
12 screenshots were inspected; only inherited spacing-scale information remains.

## Rollout boundary and remaining work

No production deployment, new production dependency, provider/model change, live
paid call, real invitation or credential mutation occurred. Policy records used
in tests exist only in throwaway databases. Existing installations retain finite
enforcement until the explicit owner-authorized policy command is applied.

A read-only inventory found the default local development database still at
`0009_dm_substitutions`. It was not migrated or seeded: earlier pending migrations
include historical data handling outside this isolated verification. Rollout must
use the intended database, preserve its data and apply the full migration chain
before recording text/image unlimited policies. This report does not claim that
the currently running installation already uses unlimited mode.

Stage 390 package/schema/compiler and Stages 400–450 generation, both previews,
selective revision, activation and human play acceptance remain future work.
Stage 380's private containers are intentionally not a generated campaign.
