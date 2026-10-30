# Workshop browser access (Stage 380)

Read the accepted Stage 370 contract, current work order and `apps/web/AGENTS.md`.

- `start.ts` captures and clears the invitation fragment before any request.
- `transport.ts` keeps credentials inside one-shot holders/request-local variables;
  React state/props receive no token. Never use browser storage for credentials/data.
- `app.tsx` owns entry/replacement/sign-out; campaign sign-in is independent.
- `drafts.tsx` owns private container metadata and paging, no later-stage package UI.
- A changed/revoked owner drops all private content. New server reads remain scoped.
- Draft requests include the mounted `x-workshop-owner` identity, so a replaced
  cookie cannot move an old tab's draft input into the new owner's workshop.
- New strings go in `i18n/ru-access.ts`, already loaded by the dictionary coverage test.
- Use the existing UI art/tokens; inspect 1440/768/390/320 px and run layout/axe checks.
