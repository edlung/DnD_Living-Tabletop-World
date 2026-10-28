# SI-N1: NPC lines, live check (2026-10-28)

Owner decisions 11, `SI-N1-npc-lines`; ADR 0020 amendment 2026-10-28. A focused script
(`npc-lines-live.ts.txt`) drives the real dialogue route over the Russian Ravenford seed, with
live `claude-sonnet-5-5` (effort low, the runtime adapter `createAnthropicProvider`) as the only
`npc-dialogue` provider, and records each exchange's exact system text, prompt and reply. "Before"
ran with the four changed source files stashed (base `3251f25`), "after" with the change. Same
script, same steps. No key is recorded.

Spend, from returned usage at catalog prices: $0.0257 + $0.0225 (Mira, Orin) + $0.0072 + $0.0075
(Thorne) = about **$0.063**, under the $1 limit. The script stopped itself at $0.40 per run. It
did not go through the stored-ceiling ledger: an admitted attempt holds about $2.54 (the full
context window, `reports/STAGE_300_COMPLETION.md`), more than a $1 ceiling admits.

| Step                                 | Before                                                                  | After                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Mira, 2nd conversation, Talk         | «О караване Торговой гильдии я здесь ничего не скажу… Это не моё дело.» | «Караван вёз товары для Торговой гильдии по Старой Торговой дороге — это я уже говорила.» |
| Mira, asked about the caravan again  | «Про караван Торговой гильдии мне сказать нечего»                       | «я уже сказала всё, что знаю: караван вёз товары…»                                        |
| Orin, 2nd conversation, Talk         | «Заходите, осматривайтесь…» (a fresh customer)                          | «Или снова пришли с вопросами? Всё, что знал о том знаке, я уже рассказал.»               |
| Orin, «Расскажите ещё про этот знак» | consistent                                                              | «Я уже сказал вам всё, что знаю…» and repeats it                                          |
| Thorne, first greeting               | introduces himself and volunteers the caravan unasked                   | introduces himself, volunteers nothing                                                    |
| Thorne, 2nd conversation, Talk       | «Спрашивайте… Что именно вас интересует?»                               | «всё, что знал про караван, я вам уже сказал. Он ушёл после восхода на север…»            |

Not reproduced in either run: the «Золотой Олень» lodging advice (no NPC offered lodging before or
after, so the new instruction is shown only by the prompt tests). Orin did not re-introduce himself
in the "before" run either; the stand-in's re-introductions are sampling-dependent. Replies are
model prose, not records; voice and quality remain human judgments.
