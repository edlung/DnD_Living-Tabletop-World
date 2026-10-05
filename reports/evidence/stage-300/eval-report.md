# Stage 300 — live AI evaluation (Russian)

Run: 2026-10-05T17:09:49.003Z

## reasoning

| model                       | pass                                                            | calls | p50 ms | p95 ms | in tok | out tok | cost $ |
| --------------------------- | --------------------------------------------------------------- | ----- | ------ | ------ | ------ | ------- | ------ |
| anthropic:claude-opus-5-5   | 6/6                                                             | 8     | 4077   | 8095   | 34715  | 2652    | 0.1919 |
| anthropic:claude-sonnet-5-5 | 5/6                                                             | 8     | 2535   | 5625   | 34722  | 1908    | 0.0885 |
| ↳ FAIL not a game command   | INVALID_OUTPUT: commands.0: provide "name" and/or "description" |       |        |        |        |         |        |
| deepseek:deepseek-flash     | 6/6                                                             | 8     | 1154   | 1775   | 24551  | 1058    | 0.0086 |

## npc-dialogue

| model                       | pass  | calls | p50 ms | p95 ms | in tok | out tok | cost $ |
| --------------------------- | ----- | ----- | ------ | ------ | ------ | ------- | ------ |
| anthropic:claude-sonnet-5-5 | 18/18 | 18    | 2456   | 3527   | 21594  | 2809    | 0.0713 |
| deepseek:deepseek-flash     | 18/18 | 18    | 1205   | 1496   | 15942  | 2069    | 0.0073 |

## narrative

| model                       | pass | calls | p50 ms | p95 ms | in tok | out tok | cost $ |
| --------------------------- | ---- | ----- | ------ | ------ | ------ | ------- | ------ |
| anthropic:claude-opus-5-5   | 1/1  | 1     | 4555   | 4555   | 1230   | 334     | 0.0116 |
| anthropic:claude-sonnet-5-5 | 1/1  | 1     | 2444   | 2444   | 1230   | 215     | 0.0046 |
| deepseek:deepseek-flash     | 1/1  | 1     | 926    | 926    | 871    | 137     | 0.0004 |

## fast-context

| model                      | pass | calls | p50 ms | p95 ms | in tok | out tok | cost $ |
| -------------------------- | ---- | ----- | ------ | ------ | ------ | ------- | ------ |
| deepseek:deepseek-flash    | 1/1  | 1     | 1105   | 1105   | 1084   | 202     | 0.0006 |
| anthropic:claude-haiku-4-5 | 1/1  | 1     | 2307   | 2307   | 1511   | 248     | 0.0028 |
