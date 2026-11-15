# Collection tools

Scope: `work-orders/TEN_CAMPAIGNS_2026-11-08.md`, extended by
`work-orders/CAMPAIGN_DISTINCTNESS_REWORK_2026-11-09.md`. Offline content assembly.
Preserve the separate campaign pipelines of other sessions. No environment files, databases,
network calls, credentials or real campaign activation. The owner-gated entry points for reworked
campaigns (`sonnet-write.ts`, `import-art.ts`) and the art tools live in `scripts/campaign-shared/`.

Source format: `CONTENT_CONTRACT.md`; rewritten campaigns (`world.engine` set) may add
`source/items.json` and `assets/` (`../campaign-shared/campaign-art.ts`). Keep modules below 500 lines where practical, never 700.
