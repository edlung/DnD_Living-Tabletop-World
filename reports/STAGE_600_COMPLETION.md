# Stage 600 completion — accounts and the hub

Work order `work-orders/STAGE_600.md`; ADR 0041 (amends ADR 0036); program `docs/FULL_GAME_PLAN.md`
(Milestone A, decision 2), owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`; 2026-11-02.

## What changed

- **Accounts (server, invitation mode).** A login (3–32 of `a-z 0-9 . _ -`, case-insensitive) and
  a scrypt password (N 2^15, r 8, p 3, 16-byte salt, 64-byte key, constant-time compare, a decoy
  hash for unknown logins). Created only with a live invitation (`/auth/redeem` with `newAccount`)
  or by claiming the seat of a live campaign session (`/auth/claim`). `ltw_account` (30 days,
  `Path=/api; HttpOnly; SameSite=Strict`) authenticates only `/auth/*` account routes and
  `/account/*`, never a campaign route. Sign-in, sign-out (with this browser's campaign session),
  the hub's listing, opening a seat (a fresh ADR 0036 campaign session that descends from the
  seat's used invitation; the browser's previous one revoked), a campaign from Ravenford (EN or RU)
  with the account as its DM (seeded through real commands, every seat released), renaming,
  changing the password. Migration `0027_accounts.sql` (accounts, seats, sessions, resets; one-way
  triggers; a campaign session only from a used invitation of its campaign).
- **Seats follow membership.** A redeem adds the seat (a taken login or a second seat in the same
  campaign is refused before the invitation is spent, so the same link works again); the DM's
  revocation removes it.
- **Recovery.** The DM's reset link on the Players sheet (only for a login that plays at that DM's
  tables alone) and `pnpm auth:operator reset-password --login`; single use, 72 hours, shown once;
  a new password signs the login out of every device and every seat's campaign session.
- **Client.** The join page asks how the person comes back — a new login (default), "I have a
  login" (signed in first, then the seat joins that login), or only this browser — and still sends
  nothing before "Take your seat". Signed out: signing in by login. The hub: my campaigns (name, my
  role and character, language), open, a new campaign from the ready adventure in English or
  Russian, the name and the password, sign out. In a world: "My campaigns", or "Save my seat" (a
  new login for a seat taken without one). Signing out of a world with a login signs the login out
  too. A reset link's page. The DM's Players sheet: each player's login, a password reset link, and
  every link shown once with its QR code (`qrcode-generator` 1.4.4, MIT; markup only). Forms check
  themselves in the app (errors beside the field, focus on the first), never the browser's bubble.
  Russian dictionary `ru-accounts.ts`; styles `accounts.css`.
- **Shared fix from the layout audit.** Text fields get their own edge token `--field-edge`
  (3:1 or better on the glass, WCAG 1.4.11) instead of the 2.3:1 hairline every field had.

## Verification

- Unit 3527 passed (new: accounts routes 12 — joining with a new login, signing in anywhere,
  the login lock, a taken login and a second seat with the invitation unspent, claiming, the DM's
  reset and its scope, a forged token learning nothing, the password change, a campaign from the
  template, the ten-campaign limit). Integration 357 passed on PostgreSQL (new: the account store's
  uniqueness, one-way sessions, single-use resets, campaign sessions only from a used invitation).
- Browser: `accounts.spec.ts` 2 journeys (new logins for the DM and a player; sign out, a wrong
  password, sign in on another device, the hub, a campaign from the adventure, back to the first;
  the QR codes; the DM's reset link signing the other device out; saving a seat; a taken login
  with the invitation unspent; "I have a login" after the seat was freed), axe on the hub, the reset
  page and the save-seat dialog. The sign-in journeys (26) still pass with the new join page; the
  full browser suite result is below.
- Layout audit (1440, 768, 390, 320) of the signed-out page, the join page in each mode and with its
  errors, the reset page, the world's top bar (EN, RU), the Players sheet with a link and its QR
  code, the hub with one and two campaigns, and the save-seat dialog: no errors after the fixes
  (field edges, the link field's width, a hint repeating its error, the hub's art strip on phones).
- Lint, typecheck, Prettier and the context budget clean.

## Adversarial notes

- Found and fixed in this pass: a forged token with `newAccount` answered 409 "login taken" before
  the invitation was checked — a login oracle without an invitation; now only a live invitation
  answers about logins (route test). A DM's reset link would have opened the player's seats at
  other DMs' tables; a DM now resets only a login that plays at that DM's tables alone, the operator
  any (route test). A reset or a password change left the seats' campaign sessions alive; they end
  now (route tests).
- Still true from ADR 0036: a token never in a URL, storage or log; the join page sends nothing on
  load; a password lives only in its field until sent and is never kept in state after a submit.
- Accepted: a login is visible to the DMs of its campaigns (ADR 0041 §8); a seat taken without a
  login stays a browser seat until saved; several characters per account are decision 14, later.
