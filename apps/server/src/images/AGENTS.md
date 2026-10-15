# Images (`src/images/`)

Image generators behind the port of `@ltw/ai` (`packages/ai/src/images.ts`), their spending and
the curated Ravenford set. Authority: `docs/adr/0035-images.md` and `docs/STAGE_330_DESIGN.md`
(Stage 330), ADR 0022 (lineage, approval, visibility, worker), ADR 0034 (art direction). The asset
worker and content stores stay in `src/assets/`. Gate 06 reviews these surfaces
(`docs/GATE_COVERAGE.md`, row 330).

| Concern                                                                             | File                                            |
| ----------------------------------------------------------------------------------- | ----------------------------------------------- |
| Model allowlist with each model's reservation, endpoint, generator names            | `models.ts`                                     |
| `openrouter-openai`: request, reservation, call, validation, settlement, failures   | `openrouter-generator.ts`                       |
| Reading OpenRouter's answer: data URL, refusal, reported cost, model, generation ID | `openrouter-response.ts`                        |
| Fixed style prompt (ADR 0034) and the task text built from the brief                | `style.ts`                                      |
| Curated style references, downscaled once at startup                                | `style-references.ts`                           |
| Re-encoding to WebP ≤ 1,536 px and ≤ 1.5 MB; figure to alpha, battle map to 4:3     | `reencode.ts`                                   |
| Image ledger: ceiling revisions, reservations, settlements, operator status         | `ledger.ts` (migration `0011_image_budget.sql`) |
| The curated set: manifest schema, hash check, `curated` generator                   | `curated-set.ts`                                |
| Importing the curated set through real commands, idempotently                       | `curated-import.ts`                             |

Configuration (`src/platform/config/config.ts`, `.env.example`):

- `LTW_IMAGE_GENERATOR`: `placeholder` (default; tests and offline use) or `openrouter-openai`.
- `LTW_IMAGE_MODEL`: one of `models.ts` (default `openai/gpt-5.4-image-2`; `openai/gpt-5-image-mini`
  is the cheaper alternative). Anything else is a startup error.
- `OPENROUTER_API_KEY`: required for `openrouter-openai`, read only from the environment
  (`.env.local`), held as a `Secret`, revealed only for the request header.
- `LTW_ASSET_TIMEOUT_MS`: one generation's bound; 180 s by default with `openrouter-openai`.
- The ceiling is never configuration: `pnpm ai:operator image-budget-set --micros <n> --owner …
--authorized-on … --authorization-source …` (zero stops all calls); `pnpm ai:operator status`
  shows the counters (`images`). Without a stored ceiling every in-play call is denied.

Rules:

- Make no live provider call in tests: inject `fetch` (`../testing/fake-fetch.ts`); the global
  `fetch` is a trap (`tests/setup/no-network.ts`). Unit tests use `RecordingImageLedger`
  (`../testing/fake-image-ledger.ts`); only `PostgresImageLedger` is a spending authority.
- Reserve before every call, settle after it; keep a reservation whole when the cost is unknown;
  release only what was provably never sent (`not-sent`). Ledger writes take the one exclusive
  advisory lock (`IMAGE_LEDGER_LOCK_KEY`) in a READ COMMITTED transaction; never update or delete.
- A request is built from the brief only: the entity's kind and recorded description, the
  variant, the purpose, the DM's typed note. Never the entity's name or ID, never other campaign
  data. A derived variant sends its canonical reference as the input image; a new reference two
  curated style references.
- Logs carry fixed messages, HTTP statuses and failure codes only: never the key, request,
  answer, entity or an amount. Errors carry no `cause`.
- Failures map to the existing codes: `REFUSED`, `TIMEOUT`, `PROVIDER_ERROR`; no call made
  (no budget, ledger down, no job, a canonical reference not stored or no raster picture, such as
  a placeholder SVG) is `UNAVAILABLE`. Each leaves the neutral fallback: no image reaches anyone
  before the DM approves one.
- Never edit the curated pictures (`fixtures/ravenford-ru/assets/AGENTS.md`). The import runs in
  `seed:ravenford` and the browser-test server (`../testing/ui-image-campaigns.ts`). It approves
  only a job that produced the committed picture (provider `curated`, the manifest's hash), and
  retries a failed one under the next derived command ID (at most three attempts), so reruns stay
  idempotent. The server's asset worker leaves the import's requests (`isCuratedRequest`) alone;
  still run the seed while the server is stopped.
- Tests (provider stubbed at the HTTP boundary): `openrouter-generator.test.ts` (request shape,
  answers, failure mapping, the key), `openrouter-spending.test.ts` (reservation, settlement,
  release), `reencode.test.ts`, `in-play.test.ts` (through the asset worker: the stored canonical
  reference as the input image, a denied budget), `curated-import.test.ts` (idempotence,
  provenance, retries), `ledger.integration.test.ts` (ceiling, settle, append-only, the lock,
  races, operator CLI), `images.integration.test.ts` (the lineage written before purposes, the
  curated import on PostgreSQL); fixtures `../testing/image-provider.ts`. Purposes:
  `packages/domain/src/assets/purposes.test.ts`, `purposes.property.test.ts`,
  `packages/domain/src/visual/figures.test.ts`, `../http/image-purposes.test.ts`,
  `packages/combat/src/asset-history.test.ts`.
