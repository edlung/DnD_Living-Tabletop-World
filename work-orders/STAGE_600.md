# Work Order — Stage 600: Accounts and the hub

Authority: owner approval 2026-11-02 (`reviews/OWNER_FULL_GAME_2026-11-02.json`), program
`docs/FULL_GAME_PLAN.md` (Milestone A, decision 2); ADR 0041 (accounts), amending ADR 0036.

## Deliver

1. **Accounts** (server, invitation mode): login and password (scrypt), created only with a valid
   invitation — redeeming it as a new account, or claiming the seat of a live invitation session;
   sign-in and sign-out; the account cookie; limits; changing the password and the display name.
2. **Seats**: an account's campaigns with its actor and role; added with a redeem; removed with the
   DM's revocation of the member; opening a campaign mints ADR 0036's campaign session for the seat.
3. **The hub**: my campaigns (name, role, my character, language), open one, create a campaign from
   Ravenford (English or Russian) as its DM, account settings, sign out.
4. **Joining**: the join page signs in or creates an account, then takes the seat; the DM's
   invitation is also a QR code in the Players sheet.
5. **Recovery**: a reset link from the operator CLI or from the DM of a shared campaign.
6. Tests: unit and route tests for accounts, seats, limits, recovery and refusals; PostgreSQL
   integration for migration 0027; browser journeys on the sign-in server (create an account by an
   invitation, sign out and in, the hub, open and switch campaigns, create a campaign, the QR code, a
   reset).

## Boundaries

Inside a campaign the ADR 0036 session and the World Engine's membership decide everything, as
before. No open sign-up, no e-mail. Development personas unchanged.
