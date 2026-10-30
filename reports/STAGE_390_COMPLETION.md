# Stage 390 — Campaign packages and isolated compiler

Date: 2026-10-30. Status: **TECHNICALLY_VERIFIED / CONTINUING_BY_OWNER_DIRECTION**.
Base: `b6d5957`, branch `codex/stage-390-campaign-packages`.
Authority: accepted ADR 0038 and
`reviews/OWNER_CAMPAIGN_CONTINUATION_2026-10-30.json`. The owner accepted 380 and
explicitly delegated subsequent technical checkpoints; this report claims no human
play acceptance. Scope: `work-orders/STAGE_390.md`; details: `docs/STAGE_390_DESIGN.md`.

## Implemented

Strict versioned content separates scoped knowledge, current facts and future
scenario plans. Owner-private immutable revisions have stable opaque UUIDs,
server-owned provenance, exact digests, nonce replay and base-revision CAS.
PostgreSQL serializes writes on the owned draft; migration 0016 guards immutable
history/IDs against update, delete and truncate. Metadata history is paginated.

A pure compiler validates references, topology, time, supported mechanics and
quest definitions, then the server executes its initial plan through actual World
Engine decisions in isolated memory. Prepared fights use independent branches.
No real event store is reachable. HTTP returns packages and findings, never a raw
canonical snapshot. Campaign credentials cannot open these workshop routes.

«Колокол подо льдом» compiles READY independently of Ravenford: 22 entities, eight
scoped knowledge records, one prepared encounter and one quest. Prepared seats
have sheets but no invented player account, played encounter, memories or progress.

## Changed boundaries

Contracts: `packages/contracts/src/campaign/`; pure plan and specimen:
`packages/domain/src/campaign/`; server persistence, HTTP and materializer:
`apps/server/src/workshop/packages/`; shared auth extraction: `workshop/access.ts`;
migration `0016_campaign_packages.sql`; main/workshop composition and context docs.

## Verification and own adversarial pass

Full isolated `pnpm validate` passed: **3,049 unit / 312 files; 261 integration /
45 files; 144 Chromium journeys**. Formatting, lint, types, context budget (1,158
active files; zero over target), build, migrations and seed passed. The database
was dropped afterward. Final changed-contract formatting and diff checks passed.
Evidence: `reports/evidence/stage-390/validation.txt` and its reproduction runner.

The adversarial pass covered cross-owner reads/writes and malformed credentials;
forged source/IDs; stale and simultaneous saves; altered nonce reuse; retry after
later versions; key removal/restoration/kind substitution; history paging; corrupt
digests; cyclic locations/knowledge; invalid scopes and temporal knowledge; all
quest references; unsupported sheets and illegal prepared-combat cells. PostgreSQL
restart, immutable update/delete/truncate guards and absence of live events are
exercised. Valid payloads above the former default 64 KiB body limit are accepted.

Two issues were fixed before the checkpoint: real World Engine NO_EFFECT defaults
are omitted from effective bootstrap plans; the terminal revision is kept within
the range retrievable by HTTP. The terminal-base regression first failed, then
passed; the final full unit run includes it. No unresolved invariant finding.

## Remaining obligations

Stages 400–450 add generation, scenario/visual UI, selective edits and activation.
This checkpoint does not claim those future surfaces, general story solvability,
live provider quality or owner play acceptance. No paid provider, production
credential/dependency, default development DB, deployed site or live campaign was
changed. The existing large Vite chunk warning remains unchanged.

The selected session model implemented and verified the stage with narrow
same-model helpers as implementation details. No separate approval role was used.
Artifact identity is `reports/evidence/stage-390/package.sha256`; the handoff
records its hash. Under the owner's instruction the session now proceeds to400.
