# Shared campaign tooling

Scope: `work-orders/CAMPAIGN_DISTINCTNESS_REWORK_2026-11-09.md`. Used by the five collection tool
folders for campaigns rewritten to the distinctness map (`world.engine` is set).
`srd-blocks.json` is generated from the SRD 5.2.1 monster blocks (CR 5 and below, fields the
stat-block contract accepts); read by key. `combat-kit.ts` builds foes, stat blocks and
per-encounter battlefields; `maps.ts` draws them. No network, provider or database, except
`sonnet-author.ts` / `sonnet-stream.ts`: the owner-gated Sonnet 5.5 authoring client over the
project's Anthropic adapter and catalog pricing (streamed, effort high, ledger and ceiling per
campaign; key only from the process environment). Run it only after the owner's decision.

Reworked campaigns of any registered series (`series.ts`: `collection-2026`, `fantasy-2026`,
`dark-fantasy-2026`, `noir-2026`; add a series once its tools load `items.json`) share these entry
points, addressed as `<series>/<slug>`. For `noir-2026` the writer also has a `case` job
(`case.json`) and writes `startHour`, `weather` and NPC `status`:

- `sonnet-write.ts` sends paid Sonnet 5.5 requests (owner's decision and ceiling only; the key comes
  from the process environment, e.g. `node --env-file=.env.local`, and is never read or printed).
  Answers and the ledger stay in `reports/evidence/<slug>-rework-<date>/`; add the date to `DATES`.
- `campaign-art.ts` converts `assets/` PNG originals to runtime WebP and `manifest.json` (picture ids
  equal entity keys); `curated-art.ts` binds them to one exact authored package;
  `import-art.ts` transfers them into an activated campaign named by an explicit `DATABASE_URL`,
  read-only without `--confirm`. `campaign-art.test.ts` covers every illustrated campaign.
- Figures (owner, 2026-11-17): every figure picture faces right; the board mirrors one toward its
  nearest opponent. A hero's painted miniature is an art entry of kind `figure` with id
  `<key>--figure` and `subject: <key>`; it stands derived from the portrait (library and curated
  import) and never appears in the books. `facesLeft: true` mirrors a left-facing figure itself, or
  writes `runtime/<id>--figure.webp` beside a left-facing token.
