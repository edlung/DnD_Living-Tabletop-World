# A campaign's move (Stage 697a)

Read `docs/adr/0061-local-mode.md` §5–6 first. A campaign lives on one server at a time: exporting it
for a move marks it away (migration 0039), importing the package brings it home there.

| Concern                                  | Entry points                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| What moves, table by table, and how      | `tables.ts` (`MOVED_TABLES`, `LEFT_BEHIND`); `tables.integration.test.ts`    |
| The package's lines and digest           | `package.ts` (`PackageWriter`, `readPackage`)                                |
| Export (a copy, or a move with its mark) | `export.ts`                                                                  |
| Import: staging, the merge, accounts     | `import.ts`, `stage.ts`, `merge.ts`, `import-accounts.ts`                    |
| Away or home; the 409 `MOVED` guard      | `moves.ts`, `guard.ts`; `http/app.ts` (guard, error handler), lobby, account |
| The operator's command                   | `campaign-move-cli.ts`, `cli-args.ts`; `deploy/scripts/campaign-move.sh`     |
| Two servers in a test                    | `move.integration.test.ts`; `../../testing/campaign-move.ts`                 |

- A table that names a campaign is either in `MOVED_TABLES` (with its kind) or in `LEFT_BEHIND`
  with its reason; the coverage test fails otherwise. Order matters: a table after those it
  refers to (the import writes in this order and deletes `state` rows in reverse).
- History is never rewritten: an import appends only beyond this server's history, which must be
  the package's beginning. Never bypass `checkHistory` or the readability check before the commit.
- Identity and generated columns never travel (`columnsOf`): each server numbers rows itself.
- Table and column names come from `MOVED_TABLES` and from this server's schema, never from a
  package; a package's unknown table or column refuses it.
- A package holds password hashes: nothing here prints a row; the CLI writes files with mode 600.
- The guard refuses changes by path (`campaignId`); writes that reach an away campaign another way
  meet the triggers, and `isAwayRefusal` answers them as 409 too. Opening a campaign from the
  account (`/account/campaigns/:campaignId/enter`) is a read.
