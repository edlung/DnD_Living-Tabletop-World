# velvet-ledger, round 2: binding decisions after the final critic and the bell simulation

Source: `finale-sim/results.md` (finale decided by the morning gap: all printed tables won 94–100%)
and `finale-sim/results-tuned.md` (≈250 lever combinations). Decision of the session: apply the
smallest tuned rule set; keep the week's economy and the printed evening-7 benchmarks. A table that
traded well all week arrives covered; the bell decides for middling tables (≈43–50% «Перевёртыш»
for the middle benchmark, 0% without the floor's Курс moves); a careless table loses. The report
states this honestly.

1. КНИГА: «Прочесть строку — польза строки (одна за удар, каждая один раз)». Reading a line no
   longer gives Курс −1 by itself (Павел's line keeps its own Курс −1 benefit). Арсений's and Ева's
   lines stay as story only: «строка без пользы для доски». Update `bell-rules`, `bell-card`,
   evening 8 dmNote and scene 2/3 texts, `world.json` where the finale is summarised.
2. КАССА: «Сделка — СЛ 15, К +3, предел 6» (was DC 13, limit 7). `bell-card` shows six circles.
3. A sold judge returns the bell at the start of stroke 12 like the others; delete «проданный не
   возвращает» / «не возвращает до конца» everywhere.
4. Rulings, verbatim where they fit:
   - R1 (РУКА АГЕНТА): «Без броска мимо: прочитана строка Ольги или Ная. Заслон против Руки —
     бросок СЛ 12.»
   - R2: «Ход Книги в ударе Руки остаётся в силе; если ярлык сорван, стойка Книги молчит в следующем
     ударе, колокольчик возвращают в начале удара через один.»
   - R3: «Лист Аскара — Слух без броска, КД −2; предел Слуха и Шёпота не тратит.»
   - R4: «Порванная бумага снимает лишние Издержки; Корнель остаётся „на крючке“ — одна любая отмена
     за колокол.»
   - R5: «Строка Ольги тратится на ближайшую Руку агента, даже если её уже отбили.»
   - R6: «Пока колокольчик у судьи, Рука агента ничего не делает.»
5. Benchmarks of the middle and risky tables in the evening-7 note: mark the share fee «(Бриг)»
   where the printed Касса assumes it was paid.
6. Evening 7 dmNote line «Ни один стол не решён: решит колокол» becomes «Хорошо проторговавший неделю
   стол приходит к колоколу с запасом; средний — решается колоколом; небрежный — проигрывает». Keep
   every other number.
7. Package budget: keep the 8-player
   package ≤ 500 000 bytes (`size.mjs`); `bell-rules` ≤ 1900 chars — if the rulings do not fit,
   move them into scene 2/3 `check` and the evening 8 dmNote.
