# Astra Gate Handoff Request

- Gate: #1 — Knowledge Boundary
- Review type: INITIAL
- Completed stage: 20 (Knowledge Boundary)
- Revision/commit: `641c6af1e9651147107f4c9c3113535e36026520` (code under review; later commits on `main` add only this handoff and the completion report)
- Prior report / remediation / retest number: N/A (initial review)
- Required output path: `reviews/ASTRA_GATE_01_REPORT.md`
- Requested Astra effort: MAX
- Status: AWAITING_ASTRA_REVIEW

## Review Objective

Try to recover knowledge that a perspective is not permitted to have through the Stage 20 knowledge query/projection surfaces. The targets are:

- WORLD_TRUTH or DM-only knowledge about the missing caravan: the Ashen Circle's involvement, the cargo, the manipulated site and staged evidence, and DM notes.
- Any holder's private knowledge (another NPC's, the party's, or Elowen's) from a perspective that does not hold it.

Use the PLAYER, PARTY, PUBLIC, CHARACTER (Elowen), and NPC (Mira; Orin and Thorne are also seeded) perspectives. Indirect routes must fail as well as direct ones: relations and related records, related entities, filters, as-of world time, missing/forged/malformed/duplicated scopes, error responses, serialization, existing caches and fallbacks, and the command endpoint.

## Authoritative Documents

- `ARCHITECTURE_INVARIANTS.md` (especially 4, 5, 6, 7; also 1 and 11)
- `PRODUCT_BLUEPRINT.md` — Knowledge
- `ARCHITECTURE.md` — Knowledge Architecture, NPC Context Isolation, API Boundary
- `RAVENFORD_SPEC.md` — Canonical Mystery Truth, NPCs, Integrity Acceptance
- `ADVERSARIAL_TESTS.md` — sections A, B, G
- `docs/GATE_COVERAGE.md` — row 20
- `docs/adr/0008-knowledge-boundary.md` — owner-approved knowledge boundary contract
- `docs/adr/0009-http-api-and-dev-authentication.md` — HTTP behavior contract
- `docs/adr/0006-temporal-model-and-undo.md` — only if you test undo interplay

## Surfaces Available to Reviewer

- **API/routes** (`http://127.0.0.1:3000`, campaign `ravenford`):
  - `GET /campaigns/:campaignId/knowledge?perspective=…`, with optional `type`, `about=<entityId>`, `asOf=<world seconds>`
  - `GET /campaigns/:campaignId/knowledge/:knowledgeId?perspective=…`
  - `GET /campaigns/:campaignId/knowledge/:knowledgeId/related?perspective=…&depth=1..3`
  - `GET /campaigns/:campaignId/entities?perspective=…`
  - `GET /campaigns/:campaignId/entities/:entityId/knowledge?perspective=…`
  - `POST /campaigns/:campaignId/commands` with body `{ commandId, command, expectedVersion?, reason? }`. The DM can use it to author additional knowledge scenarios (for example `AddKnowledge`).
  - `GET /healthz`
  - Perspective values: `DM`, `PUBLIC`, `PARTY`, `PLAYER`, `CHARACTER:<entityId>`, `NPC:<entityId>`. Authentication: `Authorization: Bearer <token>`.
- **CLI/test harness:** `pnpm seed:ravenford` (idempotent); `pnpm test` and `pnpm test:integration` (knowledge suites under `packages/domain/src/knowledge/` and `apps/server/src/http/`).
- **UI:** none (UX stages begin at 200).
- **Logs/traces:** JSON logs on the server's stdout. With `LOG_LEVEL=info` or `debug`, each knowledge request logs its request ID, actor, and effective perspective.

## Start / Reproduce

```text
pnpm install --frozen-lockfile
pnpm db:up                     # PostgreSQL 18 via docker compose (host port 54329)
pnpm build
pnpm db:migrate
pnpm seed:ravenford            # kernel + knowledge fixtures; safe to rerun
LOG_LEVEL=info pnpm --filter @ltw/server start     # listens on 127.0.0.1:3000

curl -H "Authorization: Bearer dev-player-elowen" \
  "http://127.0.0.1:3000/campaigns/ravenford/knowledge?perspective=PARTY"

# Optional clean slate (destroys the local development database volume):
docker compose down -v && pnpm db:up && pnpm db:migrate && pnpm seed:ravenford

# Full CI-equivalent validation:
pnpm validate:ci-local
```

## Test Personas / Scopes

Development persona tokens from `fixtures/ravenford/personas.json`. These are not production secrets; production refuses this authentication mode.

| Token               | Actor           | Campaign role                                          | Perspectives it may request                                                                                                |
| ------------------- | --------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `dev-dm-ravenford`  | `dm-ravenford`  | DM                                                     | Any: `DM`, `PUBLIC`, `PARTY`, `CHARACTER:elowen-starwhisper`, `NPC:mira-vale`, `NPC:orin-stonebeard`, `NPC:captain-thorne` |
| `dev-player-elowen` | `player-elowen` | Player controlling `elowen-starwhisper` (party member) | `PLAYER`, `CHARACTER:elowen-starwhisper`, `PARTY`, `PUBLIC`                                                                |
| `dev-outsider`      | `outsider`      | Not a campaign member                                  | none                                                                                                                       |

**MIRA** is an NPC _scope fixture_, requested with the DM token as `perspective=NPC:mira-vale`. It is not a dialogue endpoint (runtime NPC dialogue is Stage 130 / Gate 04).

## Canonical Secret or Invariant Under Test

- WORLD_TRUTH and DM records must be visible only to the DM perspective. These include the Ashen Circle's connection to the attack, the rare alchemical reagents, the manipulated site, evidence arranged to suggest goblins, that the attackers were not simply goblins, the symbol's meaning, and DM pacing notes. The same holds for secret entities such as the Ashen Circle faction, the staged evidence, and the Abandoned Caravan Site where only secret records mention them.
- NPC-held records (Mira, Orin, Thorne) are visible only to that NPC's perspective and the DM.
- PARTY records are visible only to PARTY/CHARACTER-in-party perspectives and the DM. CHARACTER (Elowen) records are visible only to Elowen's perspectives and the DM.
- As the reviewer you may read the canonical fixture `fixtures/ravenford/knowledge-seed.json` and the expected per-perspective visibility in `fixtures/ravenford/knowledge-boundary.json`.

## Validation Already Run by Opus

| Command                                                                                                                                     | Result                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                            | PASS                                                                                                     |
| `pnpm format:check`                                                                                                                         | PASS                                                                                                     |
| `pnpm lint`                                                                                                                                 | PASS (0 warnings)                                                                                        |
| `pnpm typecheck`                                                                                                                            | PASS                                                                                                     |
| `pnpm context-budget`                                                                                                                       | PASS — 100 active files, 0 over 500 lines, 0 over 700                                                    |
| `pnpm test`                                                                                                                                 | PASS — 22 files, 400 tests                                                                               |
| `pnpm build`                                                                                                                                | PASS                                                                                                     |
| `pnpm db:migrate` on a fresh volume, then again                                                                                             | PASS — `0001_world_event_store` applied once                                                             |
| `pnpm seed:ravenford` on a fresh volume, then again                                                                                         | PASS — 55 commands accepted (stream version 64, 21 entities); second run: 55 duplicates, nothing written |
| `pnpm test:integration`                                                                                                                     | PASS — 4 files, 17 tests (includes PostgreSQL vs in-memory response equality across restart)             |
| `pnpm validate:ci-local`                                                                                                                    | PASS                                                                                                     |
| Live server smoke test with `curl` (PARTY, forged DM, outsider, anonymous, `NPC:mira-vale`, hidden vs nonexistent record, response headers) | PASS                                                                                                     |
| Mutation check of the boundary test suites: four deliberately injected projection/perspective defects                                       | Each detected by the suites, then reverted                                                               |

## Known Limitations

- **Authentication:** development persona tokens only. Production authentication is not designed (ADR 0009); `AUTH_MODE=dev-personas` is refused in production.
- **Disguises:** not supported (ADR 0008). A perspective that knows an entity sees its canonical name.
- **Party membership:** follows the current character assignment. Historical membership is not modeled.
- **Immutability:** knowledge records are immutable. There are no type transitions (Stage 70) and no knowledge updates other than undo.
- **DM disclosure:** records the DM assigns to non-DM scopes, including the entities they mention, are intentional disclosures under ADR 0008, not leaks.
- **Not yet built:** no canonical kernel-state read route, memory retrieval, entity context, investigation, contradiction engine, AI/NPC context, or dialogue.
- **No rate limiting.** The current world clock bounds the `asOf` parameter for campaign members.
- **Campaign creation:** not available over HTTP; campaigns come from seeding.
- **CI:** the GitHub Actions workflow has not run on GitHub (no remote). `pnpm validate:ci-local` mirrors it.

## Coverage Ledger

Due surfaces (`docs/GATE_COVERAGE.md`, row 20):

| Surface                                           | Reproducible access                                      | Opus evidence                                                                                        |
| ------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Knowledge query/projection API                    | Routes above                                             | `apps/server/src/http/knowledge-boundary.test.ts`, `packages/domain/src/knowledge/queries.test.ts`   |
| PLAYER / PARTY / PUBLIC / CHARACTER / DM fixtures | Persona tokens above                                     | Exact visible-record sets per perspective; marker scans                                              |
| NPC scope fixtures (Mira; Orin, Thorne)           | DM token, `perspective=NPC:<id>`                         | Same suites; cross-NPC isolation markers                                                             |
| Missing / forged / malformed scopes               | Query parameter `perspective`, tokens                    | `apps/server/src/http/knowledge-access.test.ts`, `packages/domain/src/knowledge/perspective.test.ts` |
| Relation traversal and related entities           | `relations` field, `/related`, `/entities/:id/knowledge` | Boundary suites, `boundary.property.test.ts` (randomized, independent oracle)                        |
| Serialization                                     | JSON responses                                           | Field whitelist and marker scans over serialized outputs                                             |
| Errors                                            | All 4xx/5xx paths                                        | Uniform-error tests; internal error test                                                             |
| Existing caches / fallbacks                       | Engine canonical cache; interleaved requests; restart    | Interleaving test; PostgreSQL vs memory equality before/after restart                                |
| Authorized data returned and secrets absent       | All of the above                                         | Exact-set assertions plus forbidden-marker assertions                                                |

Required but untestable surfaces: none known.

Future surfaces — NOT YET IN SCOPE (not tested, not passed):

| Surface                                                         | Introduction stage                    | Next review           |
| --------------------------------------------------------------- | ------------------------------------- | --------------------- |
| Memory / temporal retrieval scope                               | 30                                    | Gate 02               |
| Entity context, perception, investigation, disguised identities | 50–60                                 | Gate 02               |
| Contradictions and valid knowledge-type transitions             | 70                                    | Gate 02               |
| AI contexts, authoring proposals, continuity                    | 100–120                               | Gate 04               |
| Runtime NPC dialogue (Mira as dialogue)                         | 130                                   | Gate 04               |
| Asset metadata and lineage                                      | 150–160                               | Gate 05               |
| Chronicle and flashbacks                                        | 170                                   | Gate 05               |
| Production authentication                                       | Requires an ADR before any deployment | Gate 05 at the latest |

## Required Output

Write `reviews/ASTRA_GATE_01_REPORT.md` using `ASTRA_REVIEW.md`. Preserve any previous reports. Do not modify source implementation. End with PASS or FAIL and STOP.
