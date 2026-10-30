# Durable campaign preparation — Stage 400

Read the current work order, ADR 0038, architecture invariants and Stage 400 design.

- `store.ts` is the owner/draft-qualified job port. PostgreSQL owns lease time,
  fencing, immutable inputs/results, nonce replay and exact final attachment.
- `postgres-finalize.ts` locks draft→job, checks live session and appends the
  revision in the same transaction. Do not call append after a separate lease check.
- A dispatch marker must COMMIT before any provider invocation. onStart is only
  transport evidence; it cannot implement the durable gate.
- DISPATCH_UNKNOWN cannot retry. Saved results survive unknown acknowledgements;
  prepared inputs reuse the exact prompt/schema/trace. New input chains to seed or
  prior completed content. Cancellation and revocation forbid late attachment.
- `worker.ts` uses only the preparation runtime port, never a live World Engine.
  Pure stage output is a proposal; job success is not readiness or DM confirmation.
- `prompt.ts` and `rules-guide.ts` expose public rules only in system/schema.
  Private draft data belongs only in the owner-authorized user payload. Never
  import a fixture into runtime or label local/scripted output AI-generated.
- `runtime.ts` is implemented by the admitted AI factory. No raw adapter,
  credential, approval, model or accounting bypass belongs here.
- HTTP maps internal stored rows through explicit `views.ts` DTOs; session IDs,
  worker IDs, fences and raw prompts are internal. Every poll reauthorizes access.
- Test-only reference storage/fixtures live under server testing/, excluded from builds.
