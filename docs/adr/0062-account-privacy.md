# 0062. A person's data: the privacy notice, a copy of it, deleting the account

- Status: Accepted (owner-delegated product decision 2026-11-04; `docs/FULL_GAME_PLAN.md` Stage 699,
  owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`). Builds on ADR 0041 (accounts), 0036
  (production sign-in), 0044 (online play: chat), 0040 (table dice), 0061 (local mode).
- Context: everyone at the table has an account (a login, a password, a name; no e-mail). Release 1.0
  owes them three things: to read what the game keeps about them and why, to take a copy of it, and
  to delete the account. The campaign's story is shared by the whole table: a player leaving must not
  tear pages out of the others' history.

## Decision

1. **The privacy notice** (`/privacy`, Russian and English, linked from the sign-in screen, the join
   page and the account's page): what is kept (the login, a password hash, the name at the table;
   the campaigns and characters; what one writes in chat and rolls; sign-in sessions; the campaign's
   history), why (to play), who sees it (the table, each by what their character perceives; the DM;
   the server's operator), how long (while the account and the campaign live; backups for up to two
   months), what leaves the server (nothing, unless the owner turns AI on: then the scene's text goes
   to the AI provider the owner chose, without logins or passwords), no tracking, no advertising,
   cookies only to stay signed in; how to take a copy and how to delete the account.
2. **A copy of one's data** (`GET /account/data`, "Download my data" on the account's page): one JSON
   file — the account (login, name, created, password changed), its sign-in sessions (when, never a
   token or a hash), and for each campaign its name, role and characters, the chat messages it wrote
   (as its characters, or as the DM) and the rolls it made. Never a password hash, a token, another
   person's private messages or what its characters do not know.
3. **Deleting the account** (`POST /account/delete` with the current password and the login typed
   again): the account is made anonymous — its login freed (`deleted-…`), its name "Deleted account",
   its password unusable — every sign-in ended, its open reset links spent, and its seats removed.
   The campaigns keep their story: the characters stay in the world as they were, and the DM sees
   their seats empty (to give or release them, as for anyone who left). A DM's account is not
   deleted from the account's page while it is a campaign's DM: the operator deletes it
   (`auth:operator delete-account`) and, if the campaign goes on, invites its next DM to the same
   seat (`dm-invite`). Backups keep the old account until they expire (the notice says so).

## Consequences

- No migration: the account row stays (sessions and resets refer to it, one-way), with nothing of
  the person left in it. A deleted login can be taken again by someone else.
- Stage 699 runs in parts (`work-orders/STAGE_699.md`): the person's data (this ADR); the release
  journeys of both modes on Chromium and WebKit; the audits, a security review and the report.

## Invariants affected

None: history is not rewritten (the characters and their story stay), and a copy shows only what
the account wrote and what its characters know.
