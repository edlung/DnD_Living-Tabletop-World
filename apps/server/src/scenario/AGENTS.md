# Ravenford integration suite (`src/scenario/`)

The whole vertical slice played over the real HTTP application (`docs/adr/0025-ravenford-integration.md` §3). Support code lives in `../testing/scenario/` (excluded from builds).

| Concern                                                                              | File                                  |
| ------------------------------------------------------------------------------------ | ------------------------------------- |
| Session: seeded engine (scripted checks, middle combat dice), personas, exchange log | `../testing/scenario/session.ts`      |
| Day 1: arrival, site, hypothesis, Orin, Thorne, Tomas authored and performed         | `../testing/scenario/play-day-one.ts` |
| The road, return, Day 2, Chronicle, quest log; `ambushUntilTheHex` for both answers  | `../testing/scenario/play-road.ts`    |
| Ravenford's minimum commands and events against their equivalents                    | `../testing/scenario/ledger.ts`       |
| What the player may never receive                                                    | `../testing/scenario/secrets.ts`      |
| The slice, the no-leak scan, integrity, oracle, replay                               | `ravenford.test.ts`                   |
| The ledger against `RAVENFORD_SPEC.md`                                               | `ravenford-ledger.test.ts`            |
| Integrity and DM acceptance; IGNORE                                                  | `ravenford-acceptance.test.ts`        |
| The slice on PostgreSQL, restart parity                                              | `ravenford.integration.test.ts`       |

Rules:

- Act only through public routes as the persona who would; never write to the engine directly in a scenario step.
- A step that the scenario needs throws on an unexpected status, so a broken path fails loudly at the step.
- Add to `secrets.ts` only what the player must never see in the whole session; what the party legitimately learns does not belong there.
- Keep the ledger in step with `RAVENFORD_SPEC.md`: its test reads the spec's lists.
