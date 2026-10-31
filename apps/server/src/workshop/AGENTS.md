# Workshop access (Stage 380, ADR 0038)

Authority: owner-accepted `docs/STAGE_370_DESIGN.md`,
`reviews/STAGE_370_OWNER_DISPOSITION_2026-10-30.json`, and current work order.

- A workshop owner is not a campaign principal. Never add implicit cross-access.
- Tokens are hashed with existing auth primitives. No token/hash/cookie/body/address
  in logs, errors, listing, provenance or draft metadata. Cookie path is separate.
- PostgreSQL serializes issue/redeem/revoke on the owner row and keeps redemption
  one-use. In-memory stores belong under `testing/` only.
- Every draft query is owner-qualified. Another owner's ID is the unknown-ID 404.
- Drafts are private containers with immutable package revisions (Stage 390).
  Read `packages/AGENTS.md` for revision CAS, identity and compiler boundaries.
  Generation is Stage 400 (`generation/AGENTS.md`); private polling reauthorizes
  every request. Scenario/visual preview and activation belong to410–440.
- Future progress streams must recheck this same durable session on each cycle;
  a one-time authorization is insufficient after operator revocation.
- A401 or sign-out response never expires the cookie: it may arrive after another
  tab installed a newer credential. Sign-out revokes the presented server session,
  and binds the mounted owner header. Invalid old credentials retain no server
  access; the browser clears private state. Redeem replaces the opaque cookie.
- Keep stores, HTTP, token policy and operator CLI cohesive and under 500 lines.
- Gate 07 (ADR 0038 amendment 2026-10-31): `job-limits.ts` bounds paid jobs inside each enqueue
  transaction (one active generation/edit per draft, two per owner, four pictures per owner; a
  refusal is the fixed 429) and orders the workers' `pending` so owners are served in turn. Paid
  pictures also need the owner's grant (`../images/picture-grants.ts`). Keep both in every new
  enqueue path, PostgreSQL and the in-memory stores under `testing/`.

Stage420: `preview/AGENTS.md` covers isolated owner/character scenes and static
owner-only prepared layouts; `images/AGENTS.md` covers draft jobs, exact bytes and
chosen manifests. Both use the same workshop auth boundary, never campaign
credentials. New previews cannot inject a canonical event store.
