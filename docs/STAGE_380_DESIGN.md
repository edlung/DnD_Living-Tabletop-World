# Stage 380 — implementation design

Date: 2026-10-30. Implements the owner-accepted Stage 370 contract and ADR 0038
(`reviews/STAGE_370_OWNER_DISPOSITION_2026-10-30.json`). Technical details here
preserve its product decisions; current work order is `work-orders/STAGE_380.md`.

## Workshop credentials

Use a separate `ltw_workshop` cookie (`Path=/api/workshop; HttpOnly;
SameSite=Strict`, Secure outside HTTP loopback), containing a 256-bit random token.
Store only its SHA256, owner identity, absolute expiry and revocation. Invitations
are single-use and operator-issued for a pre-existing or new opaque owner ID.
Redeem and session creation are transactional. An existing workshop login needs
explicit replacement consent; an unrelated campaign cookie is untouched.

Expose `/workshop/auth/redeem`, `/workshop/auth/session`,
`/workshop/auth/sign-out`. Apply origin protections to mutations and the session
probe, bounded guess limits, duplicate-cookie refusal and no-store responses.
Keep errors fixed and credentials out of all logging. Session lifetime uses the
existing 14-day bound; invitation lifetime uses existing bounded hours. Revoke an
owner's invitations and sessions through the operator, including concurrent redeem.

Private draft-container routes: `GET/POST /workshop/drafts`,
`GET /workshop/drafts/:draftId`. Authenticate, validate, then authorize owner;
unknown and another owner's draft get the same 404. Return only ID, title,
language and timestamps. Stage 390 adds versioned package content. There is no
workshop progress stream yet; it must authenticate this same durable identity
when introduced in Stage 400, and recheck revocation while connected.

Keep the workshop store behind a port with PostgreSQL and test-only in-memory
implementations. The cookie cannot be consumed by the campaign authenticator.
Workshop routes are composed only with configured invitation-mode public origin;
tests inject explicit dependencies. Production does not acquire an unrestricted
development persona. `workshop:operator` exposes invite/revoke with explicit owner
authorization metadata, and never prints a token except a new invitation once.

## Unlimited monetary policy

Add an append-only explicit stored policy revision, with owner authorization,
instead of changing old finite rows or using magic ceiling values. The selected
unlimited policy removes monetary comparisons for authorized text and images.
Old missing records/disabled approvals/accounts, unknown models, unrelated
campaigns, missing active/registered sessions and nonmonetary stops still refuse.
No preparation session is introduced until Stage 400. Preserve reservations,
settlements, unknown costs, startup diagnostics and operator spend reports.

Text admission must not append/obey monetary-overrun stops solely because of old
finite caps in unlimited mode. Suspect model/billing outcomes and explicit
operational restrictions remain effective. Image admission likewise requires its
explicit recorded policy, and still settles or holds every dispatched call.
Persist scope and expose an operator command to install the owner-authorized
unlimited policy. A route parameter/browser flag cannot set it. Integration tests
must exercise spends exceeding every old cap and retaining actual/unknown usage,
concurrent admission and finite-mode compatibility.

Migration allocation: 0014 is reserved for monetary policy; 0015 for workshop
owners/invitations/sessions/draft containers. Both are additive. Preserve the
historical event store and all prior migration bytes.

## Verification

Focused tests cover forged/used/expired/revoked invitations, two-connection redeem
and revoke races, replacement consent, cookie/origin/owner isolation, no-campaign
draft creation, cross-campaign refusal and secret logging. Policy tests cover
former monetary caps, unknown-charge retention, finite compatibility and genuine
operational stops. Run the full offline validation in a throwaway database.
Current UI/runtime behavior beyond this work order remains future work.
