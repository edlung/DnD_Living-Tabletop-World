# Work Order — Stage 1100: the shelf

Authority: the owner's words of 2026-11-23 (`reviews/OWNER_BOOK_INTERFACE_2026-11-23.json`), the
demo accepted («Принимаю, дальше»); program `docs/BOOK_INTERFACE_PLAN.md` (section 1100, decisions
11 and 13); ADR 0075 §10, written with the stage. Branch `claude/stage-1100-shelf`, stacked on
Stage 1090's.

## Deliver

1. Sign-in, an invitation, a table's code and signing out as the product's book lying open, with
   the ex libris (`session/sign-in-screens.tsx`, `styles/way-in.css`).
2. The hub as the shelf: campaigns, finished adventures, ready adventures and the library as books
   with labels; "Look inside the book"; the account as a page (`session/hub*.tsx`,
   `session/shelf-book.tsx`, `session/library-look.tsx`, `session/account-settings.tsx`,
   `styles/shelf.css`).
3. Where the party is on a campaign's label: `place` in the account list
   (`apps/server/src/accounts/accounts.ts`, `packages/contracts/src/session/accounts.ts`).
4. The privacy notice and "something went wrong" on paper.
5. Every campaign's book set, the bookcase, its board and the ex libris
   (`scripts/book-materials/build.ts` → `apps/web/public/book-materials/`).
6. ADR 0075 §10; `reports/STAGE_1100_COMPLETION.md`.

## Boundaries

No command, rule or projection changes; the account list names a place only when the party knows
it. No picture is drawn by the app or by hand; no provider is called.

## Checks

Typecheck, lint, format, build, unit, context budget; the way in's, the hub's and the library's
journeys; every screen of the way in looked at and audited at 1440, 1024, 768 and 390 px.
