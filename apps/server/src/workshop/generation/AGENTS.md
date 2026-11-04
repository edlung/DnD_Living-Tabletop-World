# Durable campaign preparation — Stages 400 and 430

Read the current work order, ADR 0038, architecture invariants and the current stage design.

- `store.ts` is the owner/draft-qualified job port. Each repository instance fixes mode
  `GENERATE` or `EDIT`; every read, control, lease, artifact and scheduler path enforces it.
  PostgreSQL owns lease time, fencing, immutable inputs/results and nonce replay.
- `postgres-enqueue.ts` captures an omitted GENERATE lock version under the owned draft lock.
  Explicit versions assert CAS. EDIT freezes the actual baseline, parsed scope, lock snapshot
  and selected-image manifest. Immutable nonce replay precedes current-head/guard checks.
- `postgres-finalize.ts` locks draft→job and checks the live lease/session. GENERATE has seven
  stages and attempts guarded revision append in the same transaction. EDIT has only ordinal
  zero, stage `edit`, and stores a candidate without appending. Adoption is a separate explicit
  owner operation in revisions/, never mutation of a terminal job's attachment field.
- A dispatch marker must COMMIT before any provider invocation. onStart is only transport
  evidence; it cannot implement the durable gate. DISPATCH_UNKNOWN cannot retry. Saved
  results survive unknown acknowledgements; prepared inputs reuse exact prompt/schema/trace.
- `worker-core.ts` shares the durable loop. `worker.ts` supplies only the seven-stage strategy;
  `edit-worker.ts` loads the immutable owner-qualified baseline and validates the complete
  proposal against the stored directed scope and locks. Neither invokes a live World Engine.
- `edit-spec.ts` strictly parses stored scope and verifies snapshot/projection digests. Do not
  infer permissions from display labels or provider output. The pure domain validator rebuilds
  the allowed closure, preserves outside order and distinguishes readonly locked dependencies.
- `prompt.ts`, `edit-prompt.ts` and `rules-guide.ts` expose public rules only in system/schema.
  Private draft data belongs only in the owner-authorized user payload. Oversized requests fail
  honestly; never truncate content, change models or import a fixture into runtime.
- The guide lists the whole SRD by ID (ADR 0058 §6): classes, spells, monsters, items, weapons.
  `srd-monsters.ts` writes a bestiary creature's SRD stat block into a step's raw output before
  the domain checks it (both workers); an ID the bestiary lacks refuses the step.
- `runtime.ts` is implemented by the admitted AI factory. Real preparation sessions bind the
  immutable job mode and current fence. EDIT permits `edit`; GENERATE permits its seven stages.
  No raw adapter, credential, approval, model or accounting bypass belongs here.
- HTTP maps internal rows through explicit DTOs; session IDs, workers, fences and raw prompts
  are internal. Every poll reauthorizes access. Test-only storage/fixtures live under testing/.
