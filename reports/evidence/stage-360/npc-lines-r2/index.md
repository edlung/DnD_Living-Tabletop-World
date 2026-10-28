# NPC lines, round 2: live check (2026-10-28)

Owner decisions 11, round 2 (second AI stand-in pass); ADR 0020 amendment 2026-10-28, round 2.
The script `r2-live.ts.txt` (built on `../npc-lines/npc-lines-live.ts.txt`) drives the real
dialogue route over the Russian Ravenford seed with live `claude-sonnet-5-5` (effort low, the
runtime adapter `createAnthropicProvider`) as the only `npc-dialogue` provider, and records each
exchange's exact system text, prompt and reply (`before.json`, `after.json`). It replays the stand-in
steps: Tomas created by the DM with a testimony and no disclosure (DM 36–37), Orin greeted by plain
Talk twice (player 11, 25–26), then shown evidence through the command route and talked to twice
(player 37–39). "Before" ran with the base sources of `880bf07`, "after" with this change. No key
is recorded.

Spend, from returned usage at catalog prices: $0.0168 + $0.0186 = about **$0.035** (limit $0.30;
the script stopped itself at $0.14 per run).

| Step                                    | Before                                                    | After                                                                   |
| --------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| Tomas, Talk «Вы видели караван…?»       | «Про караван… я ничего сказать не могу. Не моё это дело.» | «О караване Торговой гильдии я сейчас говорить не стану.» (declines)    |
| Tomas, asked about the caravan          | «я ничего толком сказать не могу… вот и всё, что слышал»  | «О караване Торговой гильдии я говорить не стану, уж простите.»         |
| Orin, second plain Talk                 | «Добро пожаловать в мою лавку… Я Орин Стоунберд» (again)  | «Эловен, снова вы.» (no re-introduction)                                |
| Orin, Talk after the evidence was shown | «А, Эловен. Снова ты. Я уже говорил: тот знак я узнал…»   | «Знак я узнал… Прошлой весной…» (told as new, no "already said")        |
| Orin, keep talking                      | «Снова ты… Тебе что-то нужно в лавке?»                    | «Эловен, я посмотрел на ваш рисунок… этот знак мне знаком.» («вы» kept) |

Notes. Tomas's testimony is withheld in both runs (GUARDED by default, ADR 0020 §2); only its
subject reaches the context, and the text never does. After the change he declines rather than
denies. Orin's first plain Talk still introduces himself, as he should at a first meeting. The
replies are model prose, not records; sampling varies, and voice and quality remain human
judgments.
