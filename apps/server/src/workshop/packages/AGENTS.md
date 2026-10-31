# Owner-private campaign packages (Stage 390)

- Every read/write is qualified by owner and draft. HTTP routes use the workshop
  cookie and expected-owner header; campaign credentials never authorize them.
- `store.ts` defines the revision port. PostgreSQL locks the owned draft for CAS,
  idempotent requests and immutable stable-ID allocation. Persisted rows are
  defensively decoded and digested; never update a historical revision or ID.
- `content.ts` canonicalizes content/identities; source is fixed by trusted server
  code. HTTP owners cannot forge AI provenance, IDs, digest or base revision.
- `compiler.ts` uses `buildCampaignPlan` plus actual World Engine decisions.
  `isolation.ts` constructs only in-memory stores, including prepared-fight forks.
  Never inject the production event store or serve canonical snapshots over HTTP.
- NO_EFFECT means a declarative initial value already holds; effective plans omit
  it. Every other rejected command is a finding. Preparation creates no real
  membership, memories, discoveries, quest progress or active encounter.
- Campaign-specific quests and scenario plans live in immutable package content.
  Their eventual live publication is Stage 440, never the global Ravenford file.
- Test-only memory storage and the non-Ravenford specimen remain under testing/.
- Quests and their stages have registry identities too (Gate 07, migration 0023): players read
  only `q-`/`s-` IDs. A revision without them is refused (`QUEST_IDENTITIES_MISSING`); the engine's
  bootstrap command carries no quest identities (`activation/proof.ts` `engineIdentities`).
