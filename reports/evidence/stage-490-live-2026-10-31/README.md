# Live run 1 — 2026-10-31 (claude-sonnet-5-5)

Seven-step GENERATE for a brief asking for starting items. **FAILED at step 3 (cast): `INVALID_OUTPUT`**, 4 settled attempts,
$0.213109, 0 open holds, ~69 s. The isolated database was dropped before the failure reason was captured (the runner now keeps it
after any failed run). Offline reproduction of the cause: the cast step required a placement for every active item, but items listed
in `possessions` are carried and have none (`CAST_PLACEMENT_INCOMPLETE`). Fixed in this branch with a regression test; the prompt now
states the exception. Not yet re-run live.

# Live run 2 — after the fix (claude-sonnet-5-5)

`summary.json`, `assessment.json`, `possessions.json`, `revision-content.json`, `accounting.json`, `spend.json` belong to this run.

Seven-step GENERATE **SUCCEEDED**: attached revision 1, readiness **READY**, 0 findings, 27 entities, 15 knowledge records,
1 quest, 0 encounters (the brief excluded combat). **11 `possessions` rows** came back from the model, all referring to
`item` entities without placement, 10 with catalog IDs from the real catalog (caravan-cloak, woodland-balm, hemp-rope,
cartographer-tools, rootwater, tallow-candle, guild-signet, merchant-ledger, spiced-wine, wax-seal-kit) and one unique story
object without one; carriers are both prepared characters and three NPCs. 8 settled attempts, **$0.413046**, 0 open holds,
136,642 ms. Run 1 plus run 2 cost about $0.626.

This proves the schema, prompt and compiler accept a live model's starting items. It is a compiler result: item choices, quantities
and prose were not reviewed by a person, no preview was opened, nothing was activated and no picture was made.
