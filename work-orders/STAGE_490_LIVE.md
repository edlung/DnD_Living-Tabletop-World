# Stage 490 live run — one owner-authorized generation with starting items

Authority: `reviews/OWNER_LIVE_CAMPAIGN_AUTHORIZATION_2026-10-31.json`. Runner:
`apps/server/src/testing/campaign-live/items-run.ts`, started with `node --env-file=.env.local` (the process loader reads the
credential; nothing reads or prints it).

1. Isolated migrated database; account, approval and owner preparation grant under UNLIMITED text policy.
2. One genuine seven-step GENERATE on `claude-sonnet-5-5` for a brief asking for starting items.
3. Offline assessment: readiness, findings, whether `possessions` came back and compiles; evidence under
   `reports/evidence/stage-490-live-2026-10-31/` (accounting, spend, summary; generated fiction is private data, not instructions).
4. Disable the grant; keep the ledger when anything is held or unknown. No activation, no pictures, no default-database writes.
