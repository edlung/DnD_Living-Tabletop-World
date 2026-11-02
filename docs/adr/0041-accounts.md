# 0041. Accounts: a login that holds a person's seats

- Status: Accepted (owner-delegated product decision 2026-11-02; `docs/FULL_GAME_PLAN.md` decision 2,
  owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`). Amends ADR 0036.
- Context: the owner asked for players "logged into their own accounts" at a family table and online.
  ADR 0036 gave every invitation its own cookie session bound to one actor in one campaign, with no
  login or password (owner decision Q4, superseded here at the owner's request).

## Decision

1. **An account is a login and a password** (no e-mail). The login is 3–32 characters of
   `a-z 0-9 . _ -`, compared case-insensitively; the password at least 10 characters. The password is
   stored as scrypt (N = 2^15, r = 8, p = 3 — OWASP's equivalent of N = 2^17 at a quarter of the
   memory; a 16-byte salt per account, a 64-byte key; the parameters kept in each hash) and compared
   in constant time. Node's own scrypt needs no native dependency, so it is chosen over Argon2id. Accounts are created only together with a valid invitation (redeeming it, or
   claiming the seat a live invitation session holds): there is no open sign-up.
2. **An account is a key ring, not a new kind of campaign credential.** It holds the account's seats
   — for each campaign the actor it is there and its role (DM or player). Inside a campaign nothing
   changes: requests still carry ADR 0036's campaign session (`ltw_session`), bound to one actor in
   one campaign, with its revocation, live-stream closing and `actorFor` refusal. Opening a campaign
   from the account mints such a session for the seat's actor.
3. **The account's own cookie** (`ltw_account`, `Path=/api; HttpOnly; SameSite=Strict`, `Secure`
   except on http loopback) authenticates only `/auth/*` account routes and `/account/*`; it never
   opens a campaign route. It lasts 30 days from sign-in, absolute, revocable by signing out.
4. **Seats follow membership.** Redeeming an invitation while signed in, or with a new account, adds
   the seat in the same transaction that marks the invitation used and creates the campaign session.
   The DM's revocation of a member removes the account's seat with the member's sessions and
   invitations, so the account cannot open the campaign again. An account has at most one seat per
   campaign (several characters for one account are decision 14, a later stage).
5. **A campaign from a ready adventure**: a signed-in account may create a campaign from a template
   (Ravenford, English or Russian) and is its DM; at most 10 such campaigns per account.
6. **Limits**: sign-in attempts 10 a minute per client group and 5 failures per login per 15 minutes
   (then that login refuses for 15 minutes); every failed sign-in answers the same 401; account
   creation (20 an hour per client group: a family table shares one address) and campaign
   creation (5 an hour per account) are limited. Only a live invitation answers whether a new
   login is taken: any other token gets the one 401 of ADR 0036, so no token probes logins.
7. **Recovery** without e-mail: the operator (`pnpm auth:operator reset-password`) or the DM of a
   campaign the account sits in issues a single-use reset link (`/reset#<token>`, 72 hours) that sets a
   new password and signs out the account's other sessions and every seat's campaign sessions (so
   does a changed password, keeping the account session that changed it). A DM issues one only for
   a login whose seats are all at that DM's tables (the campaign at hand, and any the DM's own login
   leads); a login that also plays elsewhere gets its link from the operator (409 `other-tables`),
   so no DM can open another DM's campaign through a player's reset.
8. **Never** a password, a hash, a token or a cookie in a log, trace, error, URL or listing; the login
   is personal data shown only to its account and to the DMs of its campaigns.

## Consequences

- Migration 0027: `ltw_accounts`, `ltw_account_seats`, `ltw_account_sessions`, `ltw_account_resets`;
  campaign sessions may descend from an account instead of an invitation.
- Development personas keep their bearer tokens (tests, local development); accounts exist in
  invitation mode.
- A person returns from any device with their login; the DM's QR code and links still add people.
