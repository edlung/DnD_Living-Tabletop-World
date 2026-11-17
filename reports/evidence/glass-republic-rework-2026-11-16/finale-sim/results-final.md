# glass-republic — coup-night rerun after round 2 (commit 387f1110)

Simulator `sim_final.py` (copy of `sim.py` changed only where the text changed), 400 runs per cell,
А/Б/В/С × 6/7/8, greedy and «чистый». Raw tables below (also `results-final-tables.md`). No campaign edits.

## Model differences from the first run (each traced to the edited text)

1. Start facts from the new `dm-ledger` «Ориентир (факты по столам)» and evening-7 Ориентир: А — 4 deputies
   (was 2); В — 6 4 3 6 5 1, Богдан did **not** refuse, Орен warned, 2 deputies (was 4 5 3 6 5 1, refused).
2. 03:00: Dawn closes ПД only if the City does not hold them («дом со стороны Города или пара отряда»);
   a pair may stay at ПД instead of the Hall (and is out of the fight). If the Dawn already holds ПД, a
   staying pair/City houses contest by the normal rule (text silent — see N1).
3. Balcony: no key → the ПД holder leads the squad out and it still answers (all three texts).
4. Fight ends at the end of round 6, on Зенон's surrender or when all heroes fall; deputies out stay out;
   a fighter who takes a deputy leaves the field.
5. Squad-glass houses always stand for the City (coordinator's reading of item 5); General/White policies
   now park them off ПД (3–4 on ПЛ, 5–6 at НД).
6. 01:00: «ТД ≤ 2 — ТД −1» unconditional; ПР −2 only with names and an empty quay (`night-dm`).
7. Lie about a glass: +ТД −1 (probe only). Stall tactic no longer needed (fight no longer ends early).

## Results (greedy; all three readings give the same %)

| table | Генералу | Белый | Площадь | key     | forced | fight rounds          | ≥1 deputy taken |
| ----- | -------- | ----- | ------- | ------- | ------ | --------------------- | --------------- |
| А     | 0        | 100   | 0       | 100%    | 0%     | 3.0–3.7               | 94–99%          |
| Б     | 0        | 0     | 100     | 100%    | 0%     | 3.3–4.5 (Зенон alone) | 0%              |
| В     | 100      | 0     | 0       | 100%    | 0%     | 2.4–2.6               | 78–86%          |
| С     | 0        | 0     | 100     | 92–100% | 0%     | 3.1–4.6               | 13–79%          |

Pure play: every ending 99–100% at every table and size. No hero party ever fell.

## Consistency check of the round-2 rules

- 03:00 closing — identical in `night-card`, `night-dm` 03, scene 3, dmNote, README; trigger and scene 2
  say «кроме пары, оставленной у ПД». OK.
- Balcony key — identical in scene 4 play/check, `night-dm` 05, encounter, `world.endings[2]`, README. OK.
- Fight end round 6 — encounter, scene 3 check, rendered session 8, maps. OK (`night-dm` 03 defers to the
  encounter).
- Side naming — `night-card`, `night-dm`, dmNote, scene 1 choices, the green-glass item: «за Город».
  **Not changed:** evening 2 dmNote (`source/sessions-1.json`, rendered `session-2.html`): «У отряда — в ночь
  стол сам ставит дом и решает его сторону».
- Glass lie — evening 2 dmNote/choices/consequences, evening 3 consequence, evening 5 dmNote, `dm-ledger`:
  «НИ +1, ТД −1 (даже при НИ 6)». OK; but at ТД 0 the −1 burns, so the lie is still free for table А.
- Arrests at 01:00 — `night-dm` makes ТД −1 unconditional, scene 2 play still ties it to the names.

## New ambiguities / exploits

- N1: a staying pair at ПД the Dawn already holds — does it «держать» them or must it win a contest? Silent.
- N2: «Площадь» without the key when the holder is not the City (Юла not behind the squad) — silent;
  irrelevant in practice because the key is now ~100%.
- E1 (design): with the key ~100% and all three answers open without it, the night no longer limits the
  ending: it only sets who stands behind the squad and what silence would give. «Идти к Зенону за ключом»
  is no longer a real choice.

# glass-republic: coup-night simulation after round 2 (final rerun)

Simulator: `sim.py` (this folder), 400 runs per cell, seed 20261116. Built only from the campaign text (evening 8 scenes/dmNote/consequences, `night-card`, `night-dm`, `dm-ledger`, `faction-sheet`, encounter `banner-hall-list`, `world.endings`, `variants/N-players.json` cells). Fight roster as given by the caller (spy AC 12, 10 HP, 2×1d6+2, sneak 2d6; guard AC 16, 11 HP; Зенон AC 13, 67 HP, yields at 30).

## Start of the night (after evening 7)

| table            | АР НИ ПА РЕ ПР ТД | glasses (S squad, K Кассия, H house) | Богдан отказал | Орен предупреждён | депутатов | имена причалов | goal of greedy policy |
| ---------------- | ----------------- | ------------------------------------ | -------------- | ----------------- | --------- | -------------- | --------------------- |
| А «поздно понял» | 6 6 3 4 4 0       | ПА K РЕ K ПР K ТД H                  | нет            | нет               | 4         | да             | Белый мандат          |
| Б «город»        | 2 2 6 6 6 5       | ПА S РЕ S ПР S ТД S                  | да             | да                | 4         | нет            | Площадь читает списки |
| В «генерал»      | 6 4 3 6 5 1       | ПА S РЕ S ПР S ТД S                  | нет            | да                | 2         | нет            | Знамёна генералу      |
| С «середина»     | 5 5 4 5 4 3       | ПА S РЕ K ПР S ТД H                  | нет            | нет               | 3         | нет            | Площадь читает списки |

А/Б/В numbers and glasses are the evening-7 «Ориентир» line; the four facts are not printed per table, they are inferred from the evening 3–7 Ориентир notes and the skeleton stories (assumption, see ambiguity A1). «Середина» is derived.

## F1 presence / Юла needs key or City: greedy policy, % per ending

| table            | N   | Генералу | Белый мандат | Площадь | ПД after 04 (D/T/C) | strike ok/fail/none | key  | forced choice | fight: only Зенон / all fell / ≥1 deputy taken | avg rounds |
| ---------------- | --- | -------- | ------------ | ------- | ------------------- | ------------------- | ---- | ------------- | ---------------------------------------------- | ---------- |
| А «поздно понял» | 6   | 0%       | 100%         | 0%      | 0/400/0             | 400/0/0             | 100% | 0%            | 0% / 0% / 94%                                  | 3.7        |
| А «поздно понял» | 7   | 0%       | 100%         | 0%      | 0/400/0             | 400/0/0             | 100% | 0%            | 0% / 0% / 98%                                  | 3.2        |
| А «поздно понял» | 8   | 0%       | 100%         | 0%      | 0/400/0             | 400/0/0             | 100% | 0%            | 0% / 0% / 99%                                  | 3.0        |
| Б «город»        | 6   | 0%       | 0%           | 100%    | 0/0/400             | 0/0/400             | 100% | 0%            | 100% / 0% / 0%                                 | 4.5        |
| Б «город»        | 7   | 0%       | 0%           | 100%    | 0/0/400             | 0/0/400             | 100% | 0%            | 100% / 0% / 0%                                 | 3.4        |
| Б «город»        | 8   | 0%       | 0%           | 100%    | 0/0/400             | 0/0/400             | 100% | 0%            | 100% / 0% / 0%                                 | 3.3        |
| В «генерал»      | 6   | 100%     | 0%           | 0%      | 400/0/0             | 0/0/400             | 100% | 0%            | 0% / 0% / 78%                                  | 2.6        |
| В «генерал»      | 7   | 100%     | 0%           | 0%      | 400/0/0             | 0/0/400             | 100% | 0%            | 0% / 0% / 83%                                  | 2.5        |
| В «генерал»      | 8   | 100%     | 0%           | 0%      | 400/0/0             | 0/0/400             | 100% | 0%            | 0% / 0% / 86%                                  | 2.4        |
| С «середина»     | 6   | 0%       | 0%           | 100%    | 0/0/400             | 400/0/0             | 92%  | 0%            | 0% / 0% / 13%                                  | 4.6        |
| С «середина»     | 7   | 0%       | 0%           | 100%    | 0/0/400             | 400/0/0             | 100% | 0%            | 0% / 0% / 76%                                  | 3.2        |
| С «середина»     | 8   | 0%       | 0%           | 100%    | 0/0/400             | 400/0/0             | 100% | 0%            | 0% / 0% / 78%                                  | 3.2        |

## F2 presence / Юла always: greedy policy, % per ending

| table            | N   | Генералу | Белый мандат | Площадь | ПД after 04 (D/T/C) | strike ok/fail/none | key  | forced choice | fight: only Зенон / all fell / ≥1 deputy taken | avg rounds |
| ---------------- | --- | -------- | ------------ | ------- | ------------------- | ------------------- | ---- | ------------- | ---------------------------------------------- | ---------- |
| А «поздно понял» | 6   | 0%       | 100%         | 0%      | 0/400/0             | 400/0/0             | 98%  | 0%            | 0% / 0% / 92%                                  | 3.8        |
| А «поздно понял» | 7   | 0%       | 100%         | 0%      | 0/400/0             | 400/0/0             | 100% | 0%            | 0% / 0% / 98%                                  | 3.2        |
| А «поздно понял» | 8   | 0%       | 100%         | 0%      | 0/400/0             | 400/0/0             | 100% | 0%            | 0% / 0% / 99%                                  | 2.9        |
| Б «город»        | 6   | 0%       | 0%           | 100%    | 0/0/400             | 0/0/400             | 100% | 0%            | 100% / 0% / 0%                                 | 4.4        |
| Б «город»        | 7   | 0%       | 0%           | 100%    | 0/0/400             | 0/0/400             | 100% | 0%            | 100% / 0% / 0%                                 | 3.3        |
| Б «город»        | 8   | 0%       | 0%           | 100%    | 0/0/400             | 0/0/400             | 100% | 0%            | 100% / 0% / 0%                                 | 3.3        |
| В «генерал»      | 6   | 100%     | 0%           | 0%      | 400/0/0             | 0/0/400             | 100% | 0%            | 0% / 0% / 77%                                  | 2.5        |
| В «генерал»      | 7   | 100%     | 0%           | 0%      | 400/0/0             | 0/0/400             | 100% | 0%            | 0% / 0% / 87%                                  | 2.5        |
| В «генерал»      | 8   | 100%     | 0%           | 0%      | 400/0/0             | 0/0/400             | 100% | 0%            | 0% / 0% / 91%                                  | 2.4        |
| С «середина»     | 6   | 0%       | 0%           | 100%    | 0/0/400             | 400/0/0             | 92%  | 0%            | 0% / 0% / 13%                                  | 4.6        |
| С «середина»     | 7   | 0%       | 0%           | 100%    | 0/0/400             | 400/0/0             | 100% | 0%            | 0% / 0% / 74%                                  | 3.1        |
| С «середина»     | 8   | 0%       | 0%           | 100%    | 0/0/400             | 400/0/0             | 100% | 0%            | 0% / 0% / 74%                                  | 3.1        |

## F3 marker / Юла needs key or City: greedy policy, % per ending

| table            | N   | Генералу | Белый мандат | Площадь | ПД after 04 (D/T/C) | strike ok/fail/none | key  | forced choice | fight: only Зенон / all fell / ≥1 deputy taken | avg rounds |
| ---------------- | --- | -------- | ------------ | ------- | ------------------- | ------------------- | ---- | ------------- | ---------------------------------------------- | ---------- |
| А «поздно понял» | 6   | 0%       | 100%         | 0%      | 0/400/0             | 400/0/0             | 100% | 0%            | 0% / 0% / 92%                                  | 3.7        |
| А «поздно понял» | 7   | 0%       | 100%         | 0%      | 0/400/0             | 400/0/0             | 100% | 0%            | 0% / 0% / 98%                                  | 3.2        |
| А «поздно понял» | 8   | 0%       | 100%         | 0%      | 0/400/0             | 400/0/0             | 100% | 0%            | 0% / 0% / 99%                                  | 2.9        |
| Б «город»        | 6   | 0%       | 0%           | 100%    | 0/0/400             | 0/0/400             | 100% | 0%            | 100% / 0% / 0%                                 | 4.4        |
| Б «город»        | 7   | 0%       | 0%           | 100%    | 0/0/400             | 0/0/400             | 100% | 0%            | 100% / 0% / 0%                                 | 3.4        |
| Б «город»        | 8   | 0%       | 0%           | 100%    | 0/0/400             | 0/0/400             | 100% | 0%            | 100% / 0% / 0%                                 | 3.4        |
| В «генерал»      | 6   | 100%     | 0%           | 0%      | 400/0/0             | 0/0/400             | 100% | 0%            | 0% / 0% / 74%                                  | 2.6        |
| В «генерал»      | 7   | 100%     | 0%           | 0%      | 400/0/0             | 0/0/400             | 100% | 0%            | 0% / 0% / 82%                                  | 2.5        |
| В «генерал»      | 8   | 100%     | 0%           | 0%      | 400/0/0             | 0/0/400             | 100% | 0%            | 0% / 0% / 87%                                  | 2.4        |
| С «середина»     | 6   | 0%       | 0%           | 100%    | 0/0/400             | 400/0/0             | 92%  | 0%            | 0% / 0% / 11%                                  | 4.7        |
| С «середина»     | 7   | 0%       | 0%           | 100%    | 0/0/400             | 400/0/0             | 100% | 0%            | 0% / 0% / 76%                                  | 3.2        |
| С «середина»     | 8   | 0%       | 0%           | 100%    | 0/0/400             | 400/0/0             | 100% | 0%            | 0% / 0% / 77%                                  | 3.2        |

## Reachability by deliberate («чистый») play, % of runs reaching the targeted ending

| reading                             | table            | N   | pure-General | pure-White | pure-Square |
| ----------------------------------- | ---------------- | --- | ------------ | ---------- | ----------- |
| F1 presence / Юла needs key or City | А «поздно понял» | 6   | 100%         | 100%       | 99%         |
| F1 presence / Юла needs key or City | А «поздно понял» | 8   | 100%         | 100%       | 100%        |
| F1 presence / Юла needs key or City | Б «город»        | 6   | 100%         | 100%       | 100%        |
| F1 presence / Юла needs key or City | Б «город»        | 8   | 100%         | 100%       | 100%        |
| F1 presence / Юла needs key or City | В «генерал»      | 6   | 100%         | 100%       | 100%        |
| F1 presence / Юла needs key or City | В «генерал»      | 8   | 100%         | 100%       | 100%        |
| F1 presence / Юла needs key or City | С «середина»     | 6   | 100%         | 100%       | 100%        |
| F1 presence / Юла needs key or City | С «середина»     | 8   | 100%         | 100%       | 100%        |
| F2 presence / Юла always            | А «поздно понял» | 6   | 100%         | 100%       | 100%        |
| F2 presence / Юла always            | А «поздно понял» | 8   | 100%         | 100%       | 100%        |
| F2 presence / Юла always            | Б «город»        | 6   | 100%         | 100%       | 100%        |
| F2 presence / Юла always            | Б «город»        | 8   | 100%         | 100%       | 100%        |
| F2 presence / Юла always            | В «генерал»      | 6   | 100%         | 100%       | 100%        |
| F2 presence / Юла always            | В «генерал»      | 8   | 100%         | 100%       | 100%        |
| F2 presence / Юла always            | С «середина»     | 6   | 100%         | 100%       | 100%        |
| F2 presence / Юла always            | С «середина»     | 8   | 100%         | 100%       | 100%        |
| F3 marker / Юла needs key or City   | А «поздно понял» | 6   | 100%         | 100%       | 99%         |
| F3 marker / Юла needs key or City   | А «поздно понял» | 8   | 100%         | 100%       | 100%        |
| F3 marker / Юла needs key or City   | Б «город»        | 6   | 100%         | 100%       | 100%        |
| F3 marker / Юла needs key or City   | Б «город»        | 8   | 100%         | 100%       | 100%        |
| F3 marker / Юла needs key or City   | В «генерал»      | 6   | 100%         | 100%       | 100%        |
| F3 marker / Юла needs key or City   | В «генерал»      | 8   | 100%         | 100%       | 100%        |
| F3 marker / Юла needs key or City   | С «середина»     | 6   | 100%         | 100%       | 100%        |
| F3 marker / Юла needs key or City   | С «середина»     | 8   | 100%         | 100%       | 100%        |

## Ending by balcony choice (greedy night, all readings, 6/7/8 pooled)

| table            | choice  | runs | Генералу | Белый | Площадь |
| ---------------- | ------- | ---- | -------- | ----- | ------- |
| А «поздно понял» | General | 3600 | 100%     | 0%    | 0%      |
| А «поздно понял» | Square  | 3593 | 0%       | 0%    | 100%    |
| А «поздно понял» | White   | 7200 | 0%       | 100%  | 0%      |
| А «поздно понял» | silence | 7    | 0%       | 100%  | 0%      |
| Б «город»        | General | 3600 | 100%     | 0%    | 0%      |
| Б «город»        | Square  | 7200 | 0%       | 0%    | 100%    |
| Б «город»        | White   | 3600 | 0%       | 100%  | 0%      |
| В «генерал»      | General | 7200 | 100%     | 0%    | 0%      |
| В «генерал»      | Square  | 3600 | 0%       | 0%    | 100%    |
| В «генерал»      | White   | 3600 | 0%       | 100%  | 0%      |
| С «середина»     | General | 3600 | 100%     | 0%    | 0%      |
| С «середина»     | Square  | 7200 | 0%       | 0%    | 100%    |
| С «середина»     | White   | 3600 | 0%       | 100%  | 0%      |

## Hour where the outcome is decided (greedy, 6/7/8 pooled)

| reading                             | table            | distribution |
| ----------------------------------- | ---------------- | ------------ |
| F1 presence / Юла needs key or City | А «поздно понял» | 04: 100%     |
| F1 presence / Юла needs key or City | Б «город»        | 22: 100%     |
| F1 presence / Юла needs key or City | В «генерал»      | 00: 100%     |
| F1 presence / Юла needs key or City | С «середина»     | 22: 100%     |
| F2 presence / Юла always            | А «поздно понял» | 04: 100%     |
| F2 presence / Юла always            | Б «город»        | 22: 100%     |
| F2 presence / Юла always            | В «генерал»      | 00: 100%     |
| F2 presence / Юла always            | С «середина»     | 22: 100%     |
| F3 marker / Юла needs key or City   | А «поздно понял» | 04: 100%     |
| F3 marker / Юла needs key or City   | Б «город»        | 22: 100%     |
| F3 marker / Юла needs key or City   | В «генерал»      | 00: 100%     |
| F3 marker / Юла needs key or City   | С «середина»     | 22: 100%     |

## DM steps per hour (mean, greedy, F1, 6 / 8 players)

| table                | 22  | 23  | 00  | 01  | 02  | 03  | 04  | 05  | total |
| -------------------- | --- | --- | --- | --- | --- | --- | --- | --- | ----- |
| А «поздно понял» (6) | 11  | 5   | 6   | 8   | 6   | 10  | 7   | 4   | 57    |
| А «поздно понял» (8) | 11  | 5   | 6   | 8   | 6   | 10  | 7   | 4   | 57    |
| Б «город» (6)        | 12  | 8   | 8   | 11  | 8   | 8   | 5   | 4   | 64    |
| Б «город» (8)        | 12  | 8   | 8   | 11  | 8   | 8   | 5   | 4   | 64    |
| В «генерал» (6)      | 12  | 8   | 10  | 15  | 8   | 10  | 5   | 4   | 72    |
| В «генерал» (8)      | 12  | 8   | 10  | 15  | 8   | 10  | 5   | 4   | 72    |
| С «середина» (6)     | 13  | 7   | 8   | 9   | 8   | 9   | 7   | 4   | 65    |
| С «середина» (8)     | 13  | 7   | 8   | 9   | 9   | 9   | 7   | 4   | 66    |

## Fight sensitivity: caller roster vs package statblock

| roster  | N   | spies/guards/deputies | escort: deputies out avg / taken≥1 / all fell / key | stall-and-rush: key / ≥1 taken / all fell |
| ------- | --- | --------------------- | --------------------------------------------------- | ----------------------------------------- |
| engine  | 6   | 2/1/2                 | 1.12 / 84% / 0% / 100%                              | 100% / 90% / 0%                           |
| engine  | 6   | 1/0/4                 | 3.20 / 80% / 0% / 100%                              | 91% / 82% / 0%                            |
| engine  | 7   | 3/1/2                 | 0.85 / 94% / 0% / 100%                              | 100% / 95% / 0%                           |
| engine  | 7   | 2/0/4                 | 3.07 / 93% / 0% / 100%                              | 100% / 94% / 0%                           |
| engine  | 8   | 3/2/2                 | 0.80 / 93% / 0% / 100%                              | 100% / 98% / 0%                           |
| engine  | 8   | 2/0/4                 | 3.08 / 92% / 0% / 100%                              | 100% / 92% / 0%                           |
| package | 6   | 2/1/2                 | 1.18 / 82% / 0% / 100%                              | 100% / 89% / 0%                           |
| package | 6   | 1/0/4                 | 3.18 / 82% / 0% / 100%                              | 91% / 78% / 0%                            |
| package | 7   | 3/1/2                 | 0.98 / 92% / 0% / 100%                              | 100% / 93% / 0%                           |
| package | 7   | 2/0/4                 | 3.09 / 91% / 0% / 100%                              | 100% / 91% / 0%                           |
| package | 8   | 3/2/2                 | 0.91 / 92% / 0% / 100%                              | 100% / 94% / 0%                           |
| package | 8   | 2/0/4                 | 3.10 / 90% / 0% / 100%                              | 100% / 92% / 0%                           |

## Balcony options available and what silence would give (greedy, 6/7/8 pooled)

| reading                             | table            | Генералу avail | Белый avail | Площадь avail | silence → Генералу / Белый / Площадь |
| ----------------------------------- | ---------------- | -------------- | ----------- | ------------- | ------------------------------------ |
| F1 presence / Юла needs key or City | А «поздно понял» | 100%           | 100%        | 100%          | 0% / 100% / 0%                       |
| F1 presence / Юла needs key or City | Б «город»        | 100%           | 100%        | 100%          | 0% / 0% / 100%                       |
| F1 presence / Юла needs key or City | В «генерал»      | 100%           | 100%        | 100%          | 100% / 0% / 0%                       |
| F1 presence / Юла needs key or City | С «середина»     | 100%           | 100%        | 100%          | 0% / 0% / 100%                       |
| F2 presence / Юла always            | А «поздно понял» | 100%           | 100%        | 100%          | 0% / 100% / 0%                       |
| F2 presence / Юла always            | Б «город»        | 100%           | 100%        | 100%          | 0% / 0% / 100%                       |
| F2 presence / Юла always            | В «генерал»      | 100%           | 100%        | 100%          | 100% / 0% / 0%                       |
| F2 presence / Юла always            | С «середина»     | 100%           | 100%        | 100%          | 0% / 0% / 100%                       |
| F3 marker / Юла needs key or City   | А «поздно понял» | 100%           | 100%        | 100%          | 0% / 100% / 0%                       |
| F3 marker / Юла needs key or City   | Б «город»        | 100%           | 100%        | 100%          | 0% / 0% / 100%                       |
| F3 marker / Юла needs key or City   | В «генерал»      | 100%           | 100%        | 100%          | 100% / 0% / 0%                       |
| F3 marker / Юла needs key or City   | С «середина»     | 100%           | 100%        | 100%          | 0% / 0% / 100%                       |

## Exploit probes (F1, 6 players)

| probe                                                                                              | result                                                                         |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| А with green glass kept by a lie (NI 6 and ТД 0: both the +1 and the new ТД −1 burn): greedy-White | Белый мандат 100%                                                              |
| А with green glass kept by a lie (NI 6 and ТД 0: both the +1 and the new ТД −1 burn): pure-Square  | Площадь читает списки 99%, Белый мандат 1%                                     |
| А with green glass kept by a lie (NI 6 and ТД 0: both the +1 and the new ТД −1 burn): pure-General | Знамёна генералу 100%                                                          |
| 04:00 strike, А «поздно понял»: NI + Кассия's glasses = 17 vs AR 6                                 | Thread wins alone: True; three pairs stacked with the Dawn (12) flip it: False |
| 04:00 strike, Б «город»: NI + Кассия's glasses = 2 vs AR 2                                         | Орен предупреждён: strike fails whatever the pairs do                          |
| 04:00 strike, В «генерал»: NI + Кассия's glasses = 4 vs AR 6                                       | Орен предупреждён: strike fails whatever the pairs do                          |
| 04:00 strike, С «середина»: NI + Кассия's glasses = 10 vs AR 5                                     | Thread wins alone: True; three pairs stacked with the Dawn (11) flip it: True  |

## Test of the key fix (k1: Зенон leaves with the key at the end of round 4; k2: round 5)

Base: F1 reading of round-2 text. Without the key the squad may read only the text of the leader behind it
(the ПД holder's) or stay silent, so the ending = the holder's ending. Greedy fight: escort deputies, then Зенон;
«чистый»: guard deputies on the bench, everyone else on Зенон.

### k1 (round 4)

| table            | N   | greedy Генералу / Белый / Площадь | key greedy | forced greedy | pure-General | pure-White | pure-Square | key pure |
| ---------------- | --- | --------------------------------- | ---------- | ------------- | ------------ | ---------- | ----------- | -------- |
| А «поздно понял» | 6   | 0 / 100 / 0                       | 100%       | 0%            | 100%         | 100%       | 100%        | 100%     |
| А «поздно понял» | 7   | 0 / 100 / 0                       | 100%       | 0%            | 100%         | 100%       | 100%        | 100%     |
| А «поздно понял» | 8   | 0 / 100 / 0                       | 100%       | 0%            | 100%         | 100%       | 100%        | 100%     |
| Б «город»        | 6   | 0 / 0 / 100                       | 62%        | 37%           | 100%         | 100%       | 100%        | 100%     |
| Б «город»        | 7   | 0 / 0 / 100                       | 97%        | 3%            | 100%         | 100%       | 100%        | 100%     |
| Б «город»        | 8   | 0 / 0 / 100                       | 98%        | 1%            | 100%         | 100%       | 100%        | 100%     |
| В «генерал»      | 6   | 100 / 0 / 0                       | 100%       | 0%            | 100%         | 100%       | 100%        | 99%      |
| В «генерал»      | 7   | 100 / 0 / 0                       | 100%       | 0%            | 100%         | 100%       | 100%        | 100%     |
| В «генерал»      | 8   | 100 / 0 / 0                       | 100%       | 0%            | 100%         | 100%       | 100%        | 100%     |
| С «середина»     | 6   | 0 / 0 / 100                       | 89%        | 11%           | 100%         | 100%       | 100%        | 93%      |
| С «середина»     | 7   | 0 / 0 / 100                       | 100%       | 0%            | 100%         | 100%       | 100%        | 100%     |
| С «середина»     | 8   | 0 / 0 / 100                       | 100%       | 0%            | 100%         | 100%       | 100%        | 100%     |

### k2 (round 5)

| table            | N   | greedy Генералу / Белый / Площадь | key greedy | forced greedy | pure-General | pure-White | pure-Square | key pure |
| ---------------- | --- | --------------------------------- | ---------- | ------------- | ------------ | ---------- | ----------- | -------- |
| А «поздно понял» | 6   | 0 / 100 / 0                       | 100%       | 0%            | 100%         | 100%       | 100%        | 99%      |
| А «поздно понял» | 7   | 0 / 100 / 0                       | 100%       | 0%            | 100%         | 100%       | 100%        | 100%     |
| А «поздно понял» | 8   | 0 / 100 / 0                       | 100%       | 0%            | 100%         | 100%       | 100%        | 100%     |
| Б «город»        | 6   | 0 / 0 / 100                       | 95%        | 4%            | 100%         | 100%       | 100%        | 100%     |
| Б «город»        | 7   | 0 / 0 / 100                       | 100%       | 0%            | 100%         | 100%       | 100%        | 100%     |
| Б «город»        | 8   | 0 / 0 / 100                       | 100%       | 0%            | 100%         | 100%       | 100%        | 100%     |
| В «генерал»      | 6   | 100 / 0 / 0                       | 100%       | 0%            | 100%         | 100%       | 100%        | 99%      |
| В «генерал»      | 7   | 100 / 0 / 0                       | 100%       | 0%            | 100%         | 100%       | 100%        | 99%      |
| В «генерал»      | 8   | 100 / 0 / 0                       | 100%       | 0%            | 100%         | 100%       | 100%        | 100%     |
| С «середина»     | 6   | 0 / 0 / 100                       | 96%        | 3%            | 100%         | 100%       | 100%        | 92%      |
| С «середина»     | 7   | 0 / 0 / 100                       | 100%       | 0%            | 100%         | 100%       | 100%        | 100%     |
| С «середина»     | 8   | 0 / 0 / 100                       | 100%       | 0%            | 100%         | 100%       | 100%        | 100%     |

### k3 (round 6; key only if no deputy was taken)

| table            | N   | greedy Генералу / Белый / Площадь | key greedy | forced greedy | pure-General | pure-White | pure-Square | key pure |
| ---------------- | --- | --------------------------------- | ---------- | ------------- | ------------ | ---------- | ----------- | -------- |
| А «поздно понял» | 6   | 0 / 100 / 0                       | 98%        | 95%           | 100%         | 100%       | 2%          | 93%      |
| А «поздно понял» | 7   | 0 / 100 / 0                       | 100%       | 97%           | 100%         | 100%       | 1%          | 99%      |
| А «поздно понял» | 8   | 0 / 100 / 0                       | 100%       | 98%           | 100%         | 100%       | 1%          | 100%     |
| Б «город»        | 6   | 0 / 0 / 100                       | 99%        | 0%            | 100%         | 100%       | 100%        | 69%      |
| Б «город»        | 7   | 0 / 0 / 100                       | 100%       | 0%            | 100%         | 100%       | 100%        | 100%     |
| Б «город»        | 8   | 0 / 0 / 100                       | 100%       | 0%            | 100%         | 100%       | 100%        | 99%      |
| В «генерал»      | 6   | 100 / 0 / 0                       | 99%        | 83%           | 100%         | 32%        | 100%        | 93%      |
| В «генерал»      | 7   | 100 / 0 / 0                       | 100%       | 87%           | 100%         | 14%        | 100%        | 99%      |
| В «генерал»      | 8   | 100 / 0 / 0                       | 100%       | 86%           | 100%         | 11%        | 100%        | 100%     |
| С «середина»     | 6   | 0 / 0 / 100                       | 93%        | 20%           | 100%         | 100%       | 100%        | 73%      |
| С «середина»     | 7   | 0 / 0 / 100                       | 99%        | 73%           | 100%         | 100%       | 100%        | 99%      |
| С «середина»     | 8   | 0 / 0 / 100                       | 100%       | 77%           | 100%         | 100%       | 100%        | 99%      |

Note: «key» columns count Зенон yielding; under k3 the squad keeps the key only if no deputy was taken, which
the «forced» column reflects. Round-2 limits of 2 and 3 were also probed (6 players): table А/В still 100% key.

**Verdict.** k1 and k2 do not bite: the party brings Зенон from 67 to 30 HP in about two rounds once it
turns on him, so the key stays at 89–100% and the choice is forced in ≤ 37% (only Б at 6 under k1).
k3 («ключ — только если ни один депутат не уведён») ties the key to the door team, i.e. to АР at 03:00:
forced 77–98% at А, 83–87% at В, 0% at Б. Reachability: А loses «Площадь» (1–2%), В mostly loses «Белый
мандат» (11–32%); every other cell 100%.
