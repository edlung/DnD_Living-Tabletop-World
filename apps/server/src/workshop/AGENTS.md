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
- Keep stores, HTTP, token policy and operator CLI cohesive and under 500 lines.
