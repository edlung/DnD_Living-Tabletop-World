# Stage 390 — Campaign packages and isolated compilation

Authority: accepted Stage 370 / ADR 0038 and the owner's continuation of
2026-10-30. This is the implementation detail of that contract. No new product
choice, provider, dependency or canonical authority is introduced.

## Content and identity

A strict schemaVersion 1 package separates world setup, typed/scoped knowledge,
party preparation, clues, conflicts, conditional situations, prepared encounters,
quest definitions, visual briefs and session plans. Local keys link these sections;
server-created UUIDs are the only prospective canonical identities. Scenario prose
is future planning, never event history. Party entries are prepared seats, never
invented controller accounts or AssignCharacter submissions.

The server keeps an immutable draft-key registry across revisions. Removing and
restoring a key restores its ID; reusing an entity key for a different kind fails.
Revisions record base number, trusted OWNER/AI source, timestamp, exact content,
identity mapping and SHA-256 digest. A request nonce is bound to content/base/source.
An exact retry returns its original revision even after later edits; changed nonce
reuse or stale base conflicts. A draft-row lock serializes these operations.

Migration 0016 adds owner-qualified foreign keys, uniqueness and immutable
update/delete/truncate guards. Queries always include owner and draft. History
pages contain at most 25 metadata entries, with explicit cursors; full versions
are separately retrievable. Technical package size is 512 KiB, not a monetary cap.

## Compilation and materialization

The pure domain compiler checks graph identity, reference kind, topology, temporal
knowledge, rules schemas, quest triggers, clues and encounter references. It emits
ordered supported kernel commands, reference-rewritten quest definitions and
findings with stable paths. Missing essentials are INCOMPLETE; inconsistent or
unsupported content is INVALID. Completeness does not prove story solvability.

The server verifies the stored digest and runs the plan through the real World
Engine with a fresh in-memory store, fixed clocks/IDs and deterministic rule dice.
The engine remains the authority for supported initialization. NO_EFFECT defaults
are removed from the effective plan; other rejected commands block readiness.
Prepared fights are checked on separate cloned in-memory branches, including legal
positions, without starting them in the initial materialization. No command
assigns users, invents play, memory or quest progress. The production event store
is unreachable from this composition. HTTP returns assessments and authoring
packages only, never raw canonical snapshots.

## HTTP and verification

Owner-only package/revision paths share workshop authorization, expected-owner
checks, origin policy and non-enumerating 404s. The HTTP body cannot specify
provenance, canonical IDs or digest. Source is set by trusted server code.

The complete Russian specimen «Колокол подо льдом» has 22 entities, eight scoped
knowledge records, one prepared encounter and one quest, all independent of
Ravenford. Tests cover valid and incomplete packages, references, cycles, scopes,
mechanics, digest corruption, revision CAS/idempotency, ID restoration, database
restart and immutability, cross-owner requests and large valid packages. The stage
report records actual checkpoint results and remaining future-stage obligations.
