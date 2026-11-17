# glass-republic — final critic: coup-night simulation and final read (2026-11-16)

Scope: evening 8 as it stands now (round-1 decisions applied). Simulator `sim.py` (this folder, stdlib
Python, `python3 -I sim.py 400`), 400 runs per cell, 6/7/8 players, four start tables, greedy and
«чистый» policies, four readings of the two load-bearing ambiguities. Raw tables follow below
(also in `results-tables.md`). No campaign file was edited.

## Model (strictly from the text)

- Start numbers/glasses: evening-7 «Ориентир» (А 6 6 3 4 4 0, ПА/РЕ/ПР у Кассии; Б 2 2 6 6 6 5, all
  glasses with the squad; В 4 5 3 6 5 1, all glasses with the squad); «С середина» derived
  (5 5 4 5 4 3; РЕ у Кассии, ПА/ПР у отряда, Юла ушла, no trade).
- Hour order (dmNote): placement → hour text → contests (shooting house 5–6 wins vs a side without one,
  losers' unarmed houses −1; else sums; tie → previous holder) → events → summary. House placement by
  number each hour; Kassia's glasses: РЕ barracks, ПР home, ПА ≤ 4 until 04:00. Pairs +2, single +1,
  Тера/Ора on ГВ +3. Hour events exactly as `night-dm` (Богдан 22, НД 23 → officers, ПД 00 with AR or 2,
  01 Нить leaves, Oren-warned −2, signal red/green/white, arrests; 02 Oren's entry, «Орен»/«Кассия»;
  03 closing + fight; 04 strike formula, City contests ПД; 05 key, leader behind, three answers, silence).
- Fight: 18×12 grid, package cells (party A4–A9(+A3, A10), foes R, Зенон R3/R4/R9), deputies J2, J11,
  G2, G11, cellar R12, Зенон never west of N, yields at ≤ 30 → key + all not-yet-taken deputies out.
  Modifiers: АР 3–4 −1 fighter, АР 0–2 none; guards 0 if ПА 5–6 or City held ПД at start of 03:00;
  gorget −1 guard; ТД 5–6 one deputy pre-out; ≥ 1 on the bench. Heroes per the caller's stat lines;
  escort with Dash; door fighters approach+lead within one 12-square budget (lead ≤ 6). Fight tactics:
  _balanced_ (one escort per deputy, rest on Зенон), _stall_ (guard deputies on the bench, rest on Зенон).
- Policies. Greedy: А — trust Кассия, Тера's pair with Нить, others hold ПД for the City, mandate at
  02:00, Тера's pair in the strike, read «Белый мандат». Б — everything for the City, Тера on ГВ at 01,
  a pair stays at ПД if the reading allows, release Юла. В — glass houses and pairs for the Dawn, promise
  to Орен at 02:00, read Орен's order. С — City first, mandate as insurance, Юла if possible.
  «Чистый»-E: every lever for ending E (houses named to E's side, margins to Орен for General, all pairs
  into/against the strike, stall tactic for the key), balcony: read E, else silence.

## Ambiguities found (each simulated where it matters)

1. **Key vs reading (load-bearing).** Scene 4 check, `night-dm` 05 and decision 6: «без ключа —
   молчание». Same scene `play`: «Ключ — у отряда, если Зенон сдался, иначе у держателя ПД: он выводит
   вас … До шести у вас один ответ». `world.endings[2]`: key gives «только право выйти к перилам и
   выбрать, кого взять». R1/R2/R4 = strict (no key → silence), R3 = lenient (holder leads you out; you
   still read; the key only lets you take Юла).
2. **03:00 closing (load-bearing).** «В 03:00 Рассвет закрывает ПД, если там нет пары отряда»
   (`night-card`, `night-dm`, scene 3, dmNote) vs «Весь отряд в Зале знамён» (encounter trigger) and
   «В конце 02:00 дверная команда пускает весь отряд в Палату» (scene 2). Literal (R1, R3): the
   condition is always true → Dawn takes ПД every night, even from a shooting РЕ 6. R2: a pair may skip
   the fight and stand at ПД (the player card invites exactly this). R4: Dawn must win ПД by the
   contest rule.
3. Four facts per Ориентир table are not printed (only numbers and glasses); assumed from the
   evening 3–7 notes. Ориентир В «генерал» (all four glasses with the squad, Богдан refused) no longer
   matches a general-leaning table.
4. Losing pairs: no consequence stated (none simulated).
5. 01:00 «ТД ≤ 2 — ТД −1»: standalone in `night-dm`, «ещё −1» under the arrests in scene 2 (simulated
   as part of the arrests; outcome-neutral).
6. 04:00 order: strike first, then the City contest (text order; not stated).
7. Squad-glass houses named «Нить»: the strike formula counts only Кассия's glasses (not counted).
8. A squad-glass house may be named for any side, including the Dawn (`night-card`) — allowed.
9. Fallen heroes at 04:00: «сажают у балконных дверей до чтения» → no pairs (assumed).
10. Spy roster: caller's engine line (10 HP, 2 attacks) vs package statblock (27 HP, 1 attack). Both run;
    same picture.
11. «Площадь» without margins, last image: session 8 «мел — на воротах штаба Орена» vs
    `world.endings[2].cost` «на стёклах только «Нить» и «Седьмая комната»».

## Answers

- **Every ending reachable by deliberate play:** yes at every table and size, 100% for General and
  White everywhere; Square 100% except table А (98%/68% at 6/8 under R1; ~50% under R2 because the
  staying pair weakens the key fight). General is reachable even for the City table only by naming the
  City's own houses for the Dawn (ambiguity 8).
- **Greedy endings:** each table gets its own goal except С, which under the literal 03:00 closing
  loses ПД to the Dawn and then to Кассия's strike: 48–92% «Белый мандат» against a City goal (R1/R3),
  but 100% «Площадь» under R2/R4. That one sentence flips the result.
- **Forced choice:** under the strict key reading the balcony is silence in 48–92% of greedy nights
  (the fight ends when the last deputy is out or taken, usually before Зенон drops to 30). Lenient
  reading: 0% forced, but Юла is available only with the key or a City holder.
- **Fight:** never lost (0% all heroes down, both rosters); 1.1–2.2 rounds on average; at table Б it is
  Зенон alone (АР 2, ПА 6), who never leaves N–R, so the deputies simply walk out in round 2. With two
  deputies on the J benches, door fighters (init +4, 12 squares) take ≥ 1 deputy in 80–95%.
- **Decided hour:** 04:00 (strike / 03:00 closing) for А, Б, С under the literal reading; otherwise the
  ПД holder set at 22:00 never changes (Б, В, С under R2/R4) — hours 23–02 move numbers but not the result.
- **Exploits:** (a) stall a deputy on the bench to keep the fight open for the key (key 36% → 96% at 6);
  (b) name City houses for the Dawn; (c) three pairs stacked with the Dawn at 04:00 flip Кассия's strike
  in С (10 vs 11); (d) a lie about a glass at НИ 6 costs nothing (the +1 burns); (e) Зенон cannot be
  killed (yields at 30, no Palace place before 03:00) — but there is no ruling if players attack him on
  the balcony at 22:30; (f) fight-skip only via R2 (a pair outside) or de facto at table Б.
- **Dead states:** none that stop the night. Strict reading + no key = ending fixed at 04:00 with no
  balcony agency; table А then always gets «Белый мандат».
- **DM load / time:** 55–70 DM steps per night (≈ 5–13 per hour, peak at 22:00 and 01:00); estimate
  ≈ 14 min placements + ≈ 30 min hour resolution + 20–30 min fight + 10–15 min balcony ≈ 75–90 min of
  procedure; the printed 3 h (6) / 4 h (8) is ample; the 80-minute fight block will run ~25 min.

# glass-republic: coup-night simulation of evening 8 (final critic)

Simulator: `sim.py` (this folder), 400 runs per cell, seed 20261116. Built only from the campaign text (evening 8 scenes/dmNote/consequences, `night-card`, `night-dm`, `dm-ledger`, `faction-sheet`, encounter `banner-hall-list`, `world.endings`, `variants/N-players.json` cells). Fight roster as given by the caller (spy AC 12, 10 HP, 2×1d6+2, sneak 2d6; guard AC 16, 11 HP; Зенон AC 13, 67 HP, yields at 30).

## Final read (Task 2)

- **Runnable from text + `night-card` + `night-dm` + `dm-ledger`:** yes for 22:00–02:00 and 04:00; two
  rulings must be invented at 03:00/05:00 (ambiguities 1 and 2). Everything else resolved by the text.
- **Round-1 decisions spot-checked (16, sources and rendered `session-8.html`):** 1 fight roster and AR
  modifiers; 2 «Тихие» 3/4/4, win rule, «восточнее столбца M»; 3 M5–M8; 4 gorget «до раунда 1»; 5 bench
  ≥ 1, released deputies count; 6/7 silence and «иной текст — молчание», «или ключ …» removed from
  `endings[2]`; 9 empty ПД / strike formula; 10 «Палата открыта изнутри»; 11 time line and 30/40/80/30;
  12 `dm-ledger` (908 chars, listed in evenings 1 and 8); 13 twelve / nine / fourteen days; 15 fold office;
  18 «в этот вечер Юла из Зала не уйдёт», «ложь вечеров 2–3»; 19 Богдан СЛ 14; 22 Ориентир lines in
  evenings 3–7; 23 Кассия's line; 25 Гелена's catchphrase; 26 Ора's bag. All present. Residue:
  `README.md` still says «разоблачения Т1–Т4 — …» (named, acceptable); rendered session 8 shows the raw
  key «`night-dm`» in the night-card unlock line.
- **NPC knowledge start-only:** all 11 `knows` lists are start-of-evening-1 facts. Tiny seam: Ростислав
  «две недели носил письма» Зенону while Кассия got the first page only twelve days ago.
- **Maps vs texts:** street-corner encounters — squad on N, foes from A (east/west correct); ballroom —
  squad on A, foes and Зенон on R; terrain cells match the SVG grid (columns A–R from the west, row 1
  north). Package spy statblock (27 HP, 1 attack) differs from the engine line given to this critic.
- **Player pages:** `players.html` has no curator secret and no 04:00; `night-card` omits 04:00. But
  `handouts/night-dm.html` (DM-only, shows the 04:00 strike) has no «Только ведущему» line in its own text
  and sits among released player handouts; `dm-ledger` does carry it.
- **New power visibly worse:** yes in all three last images (red wax on the doors; white threads on the
  quays and «Порядок»; «Завтра — следующий лист»). Last-image mismatch for «Площадь» without margins
  (ambiguity 11).
- **Banned procedures:** none (no epilogue round, outcome table, vote or «каждый называет»).
- **21+, no real spy technique, no firearms:** all ages 24–61; ciphers are fictional coloured ink; weapons
  are blades, spears, crossbows only.

## Start of the night (after evening 7)

| table            | АР НИ ПА РЕ ПР ТД | glasses (S squad, K Кассия, H house) | Богдан отказал | Орен предупреждён | депутатов | имена причалов | goal of greedy policy |
| ---------------- | ----------------- | ------------------------------------ | -------------- | ----------------- | --------- | -------------- | --------------------- |
| А «поздно понял» | 6 6 3 4 4 0       | ПА K РЕ K ПР K ТД H                  | нет            | нет               | 2         | да             | Белый мандат          |
| Б «город»        | 2 2 6 6 6 5       | ПА S РЕ S ПР S ТД S                  | да             | да                | 4         | нет            | Площадь читает списки |
| В «генерал»      | 4 5 3 6 5 1       | ПА S РЕ S ПР S ТД S                  | да             | да                | 2         | нет            | Знамёна генералу      |
| С «середина»     | 5 5 4 5 4 3       | ПА S РЕ K ПР S ТД H                  | нет            | нет               | 3         | нет            | Площадь читает списки |

А/Б/В numbers and glasses are the evening-7 «Ориентир» line; the four facts are not printed per table, they are inferred from the evening 3–7 Ориентир notes and the skeleton stories (assumption, see ambiguity A1). «Середина» is derived.

## R1 strict/literal: greedy policy, % per ending

| table            | N   | Генералу | Белый мандат | Площадь | ПД after 04 (D/T/C) | strike ok/fail/none | key | forced choice | fight: only Зенон / all fell / ≥1 deputy taken | avg rounds |
| ---------------- | --- | -------- | ------------ | ------- | ------------------- | ------------------- | --- | ------------- | ---------------------------------------------- | ---------- |
| А «поздно понял» | 6   | 0%       | 100%         | 0%      | 0/400/0             | 400/0/0             | 39% | 61%           | 0% / 0% / 85%                                  | 2.1        |
| А «поздно понял» | 7   | 0%       | 100%         | 0%      | 0/400/0             | 400/0/0             | 42% | 58%           | 0% / 0% / 92%                                  | 2.0        |
| А «поздно понял» | 8   | 0%       | 100%         | 0%      | 0/400/0             | 400/0/0             | 48% | 52%           | 0% / 0% / 94%                                  | 1.9        |
| Б «город»        | 6   | 0%       | 0%           | 100%    | 0/0/400             | 0/0/400             | 9%  | 91%           | 100% / 0% / 0%                                 | 2.0        |
| Б «город»        | 7   | 0%       | 0%           | 100%    | 0/0/400             | 0/0/400             | 14% | 86%           | 100% / 0% / 0%                                 | 2.0        |
| Б «город»        | 8   | 0%       | 0%           | 100%    | 0/0/400             | 0/0/400             | 35% | 65%           | 100% / 0% / 0%                                 | 2.0        |
| В «генерал»      | 6   | 100%     | 0%           | 0%      | 400/0/0             | 0/400/0             | 12% | 88%           | 0% / 0% / 78%                                  | 1.2        |
| В «генерал»      | 7   | 100%     | 0%           | 0%      | 400/0/0             | 0/400/0             | 10% | 90%           | 0% / 0% / 84%                                  | 1.2        |
| В «генерал»      | 8   | 100%     | 0%           | 0%      | 400/0/0             | 0/400/0             | 10% | 90%           | 0% / 0% / 90%                                  | 1.1        |
| С «середина»     | 6   | 0%       | 92%          | 8%      | 0/400/0             | 400/0/0             | 8%  | 92%           | 0% / 0% / 21%                                  | 2.0        |
| С «середина»     | 7   | 0%       | 68%          | 32%     | 0/400/0             | 400/0/0             | 32% | 68%           | 0% / 0% / 71%                                  | 2.1        |
| С «середина»     | 8   | 0%       | 48%          | 52%     | 0/400/0             | 400/0/0             | 52% | 48%           | 0% / 0% / 72%                                  | 2.0        |

## R2 strict/pair-stays: greedy policy, % per ending

| table            | N   | Генералу | Белый мандат | Площадь | ПД after 04 (D/T/C) | strike ok/fail/none | key | forced choice | fight: only Зенон / all fell / ≥1 deputy taken | avg rounds |
| ---------------- | --- | -------- | ------------ | ------- | ------------------- | ------------------- | --- | ------------- | ---------------------------------------------- | ---------- |
| А «поздно понял» | 6   | 0%       | 100%         | 0%      | 0/400/0             | 400/0/0             | 36% | 64%           | 0% / 0% / 88%                                  | 2.1        |
| А «поздно понял» | 7   | 0%       | 100%         | 0%      | 0/400/0             | 400/0/0             | 38% | 62%           | 0% / 0% / 93%                                  | 2.0        |
| А «поздно понял» | 8   | 0%       | 100%         | 0%      | 0/400/0             | 400/0/0             | 53% | 47%           | 0% / 0% / 94%                                  | 1.9        |
| Б «город»        | 6   | 0%       | 0%           | 100%    | 0/0/400             | 0/0/400             | 0%  | 100%          | 100% / 0% / 0%                                 | 2.0        |
| Б «город»        | 7   | 0%       | 0%           | 100%    | 0/0/400             | 0/0/400             | 5%  | 95%           | 100% / 0% / 0%                                 | 2.0        |
| Б «город»        | 8   | 0%       | 0%           | 100%    | 0/0/400             | 0/0/400             | 9%  | 91%           | 100% / 0% / 0%                                 | 2.0        |
| В «генерал»      | 6   | 100%     | 0%           | 0%      | 400/0/0             | 0/400/0             | 12% | 88%           | 0% / 0% / 76%                                  | 1.2        |
| В «генерал»      | 7   | 100%     | 0%           | 0%      | 400/0/0             | 0/400/0             | 10% | 90%           | 0% / 0% / 88%                                  | 1.2        |
| В «генерал»      | 8   | 100%     | 0%           | 0%      | 400/0/0             | 0/400/0             | 10% | 90%           | 0% / 0% / 88%                                  | 1.1        |
| С «середина»     | 6   | 0%       | 0%           | 100%    | 0/0/400             | 400/0/0             | 0%  | 100%          | 0% / 0% / 12%                                  | 2.2        |
| С «середина»     | 7   | 0%       | 0%           | 100%    | 0/0/400             | 400/0/0             | 26% | 74%           | 0% / 0% / 75%                                  | 2.2        |
| С «середина»     | 8   | 0%       | 0%           | 100%    | 0/0/400             | 400/0/0             | 26% | 74%           | 0% / 0% / 74%                                  | 2.2        |

## R3 lenient/literal: greedy policy, % per ending

| table            | N   | Генералу | Белый мандат | Площадь | ПД after 04 (D/T/C) | strike ok/fail/none | key | forced choice | fight: only Зенон / all fell / ≥1 deputy taken | avg rounds |
| ---------------- | --- | -------- | ------------ | ------- | ------------------- | ------------------- | --- | ------------- | ---------------------------------------------- | ---------- |
| А «поздно понял» | 6   | 0%       | 100%         | 0%      | 0/400/0             | 400/0/0             | 37% | 0%            | 0% / 0% / 87%                                  | 2.1        |
| А «поздно понял» | 7   | 0%       | 100%         | 0%      | 0/400/0             | 400/0/0             | 42% | 0%            | 0% / 0% / 92%                                  | 2.0        |
| А «поздно понял» | 8   | 0%       | 100%         | 0%      | 0/400/0             | 400/0/0             | 52% | 0%            | 0% / 0% / 96%                                  | 1.9        |
| Б «город»        | 6   | 0%       | 0%           | 100%    | 0/0/400             | 0/0/400             | 14% | 0%            | 100% / 0% / 0%                                 | 2.0        |
| Б «город»        | 7   | 0%       | 0%           | 100%    | 0/0/400             | 0/0/400             | 19% | 0%            | 100% / 0% / 0%                                 | 2.0        |
| Б «город»        | 8   | 0%       | 0%           | 100%    | 0/0/400             | 0/0/400             | 39% | 0%            | 100% / 0% / 0%                                 | 2.0        |
| В «генерал»      | 6   | 100%     | 0%           | 0%      | 400/0/0             | 0/400/0             | 12% | 0%            | 0% / 0% / 78%                                  | 1.2        |
| В «генерал»      | 7   | 100%     | 0%           | 0%      | 400/0/0             | 0/400/0             | 8%  | 0%            | 0% / 0% / 86%                                  | 1.2        |
| В «генерал»      | 8   | 100%     | 0%           | 0%      | 400/0/0             | 0/400/0             | 9%  | 0%            | 0% / 0% / 90%                                  | 1.1        |
| С «середина»     | 6   | 0%       | 92%          | 8%      | 0/400/0             | 400/0/0             | 8%  | 0%            | 0% / 0% / 23%                                  | 2.0        |
| С «середина»     | 7   | 0%       | 66%          | 34%     | 0/400/0             | 400/0/0             | 34% | 0%            | 0% / 0% / 73%                                  | 2.1        |
| С «середина»     | 8   | 0%       | 48%          | 52%     | 0/400/0             | 400/0/0             | 52% | 0%            | 0% / 0% / 72%                                  | 2.1        |

## R4 strict/contest: greedy policy, % per ending

| table            | N   | Генералу | Белый мандат | Площадь | ПД after 04 (D/T/C) | strike ok/fail/none | key | forced choice | fight: only Зенон / all fell / ≥1 deputy taken | avg rounds |
| ---------------- | --- | -------- | ------------ | ------- | ------------------- | ------------------- | --- | ------------- | ---------------------------------------------- | ---------- |
| А «поздно понял» | 6   | 0%       | 100%         | 0%      | 0/400/0             | 400/0/0             | 39% | 61%           | 0% / 0% / 88%                                  | 2.1        |
| А «поздно понял» | 7   | 0%       | 100%         | 0%      | 0/400/0             | 400/0/0             | 40% | 60%           | 0% / 0% / 93%                                  | 2.0        |
| А «поздно понял» | 8   | 0%       | 100%         | 0%      | 0/400/0             | 400/0/0             | 47% | 53%           | 0% / 0% / 94%                                  | 1.9        |
| Б «город»        | 6   | 0%       | 0%           | 100%    | 0/0/400             | 0/0/400             | 9%  | 91%           | 100% / 0% / 0%                                 | 2.0        |
| Б «город»        | 7   | 0%       | 0%           | 100%    | 0/0/400             | 0/0/400             | 17% | 83%           | 100% / 0% / 0%                                 | 2.0        |
| Б «город»        | 8   | 0%       | 0%           | 100%    | 0/0/400             | 0/0/400             | 34% | 66%           | 100% / 0% / 0%                                 | 2.0        |
| В «генерал»      | 6   | 100%     | 0%           | 0%      | 400/0/0             | 0/400/0             | 12% | 88%           | 0% / 0% / 78%                                  | 1.2        |
| В «генерал»      | 7   | 100%     | 0%           | 0%      | 400/0/0             | 0/400/0             | 9%  | 91%           | 0% / 0% / 86%                                  | 1.2        |
| В «генерал»      | 8   | 100%     | 0%           | 0%      | 400/0/0             | 0/400/0             | 9%  | 91%           | 0% / 0% / 89%                                  | 1.1        |
| С «середина»     | 6   | 0%       | 0%           | 100%    | 0/0/400             | 400/0/0             | 9%  | 91%           | 0% / 0% / 23%                                  | 2.0        |
| С «середина»     | 7   | 0%       | 0%           | 100%    | 0/0/400             | 400/0/0             | 36% | 64%           | 0% / 0% / 76%                                  | 2.1        |
| С «середина»     | 8   | 0%       | 0%           | 100%    | 0/0/400             | 400/0/0             | 49% | 51%           | 0% / 0% / 70%                                  | 2.1        |

## Reachability by deliberate («чистый») play, % of runs reaching the targeted ending

| reading              | table            | N   | pure-General | pure-White | pure-Square |
| -------------------- | ---------------- | --- | ------------ | ---------- | ----------- |
| R1 strict/literal    | А «поздно понял» | 6   | 100%         | 100%       | 98%         |
| R1 strict/literal    | А «поздно понял» | 8   | 100%         | 100%       | 68%         |
| R1 strict/literal    | Б «город»        | 6   | 100%         | 100%       | 100%        |
| R1 strict/literal    | Б «город»        | 8   | 100%         | 100%       | 100%        |
| R1 strict/literal    | В «генерал»      | 6   | 100%         | 100%       | 100%        |
| R1 strict/literal    | В «генерал»      | 8   | 100%         | 100%       | 100%        |
| R1 strict/literal    | С «середина»     | 6   | 100%         | 100%       | 99%         |
| R1 strict/literal    | С «середина»     | 8   | 100%         | 100%       | 100%        |
| R2 strict/pair-stays | А «поздно понял» | 6   | 100%         | 100%       | 52%         |
| R2 strict/pair-stays | А «поздно понял» | 8   | 100%         | 100%       | 48%         |
| R2 strict/pair-stays | Б «город»        | 6   | 100%         | 100%       | 100%        |
| R2 strict/pair-stays | Б «город»        | 8   | 100%         | 100%       | 100%        |
| R2 strict/pair-stays | В «генерал»      | 6   | 100%         | 100%       | 100%        |
| R2 strict/pair-stays | В «генерал»      | 8   | 100%         | 100%       | 100%        |
| R2 strict/pair-stays | С «середина»     | 6   | 100%         | 100%       | 100%        |
| R2 strict/pair-stays | С «середина»     | 8   | 100%         | 100%       | 100%        |
| R3 lenient/literal   | А «поздно понял» | 6   | 100%         | 100%       | 96%         |
| R3 lenient/literal   | А «поздно понял» | 8   | 100%         | 100%       | 67%         |
| R3 lenient/literal   | Б «город»        | 6   | 100%         | 100%       | 100%        |
| R3 lenient/literal   | Б «город»        | 8   | 100%         | 100%       | 100%        |
| R3 lenient/literal   | В «генерал»      | 6   | 100%         | 100%       | 100%        |
| R3 lenient/literal   | В «генерал»      | 8   | 100%         | 100%       | 100%        |
| R3 lenient/literal   | С «середина»     | 6   | 100%         | 100%       | 100%        |
| R3 lenient/literal   | С «середина»     | 8   | 100%         | 100%       | 100%        |
| R4 strict/contest    | А «поздно понял» | 6   | 100%         | 100%       | 97%         |
| R4 strict/contest    | А «поздно понял» | 8   | 100%         | 100%       | 71%         |
| R4 strict/contest    | Б «город»        | 6   | 100%         | 100%       | 100%        |
| R4 strict/contest    | Б «город»        | 8   | 100%         | 100%       | 100%        |
| R4 strict/contest    | В «генерал»      | 6   | 100%         | 100%       | 100%        |
| R4 strict/contest    | В «генерал»      | 8   | 100%         | 100%       | 100%        |
| R4 strict/contest    | С «середина»     | 6   | 100%         | 100%       | 100%        |
| R4 strict/contest    | С «середина»     | 8   | 100%         | 100%       | 100%        |

## Ending by balcony choice (greedy night, all readings, 6/7/8 pooled)

| table            | choice  | runs | Генералу | Белый | Площадь |
| ---------------- | ------- | ---- | -------- | ----- | ------- |
| А «поздно понял» | General | 1774 | 100%     | 0%    | 0%      |
| А «поздно понял» | Square  | 3398 | 0%       | 0%    | 100%    |
| А «поздно понял» | White   | 6691 | 0%       | 100%  | 0%      |
| А «поздно понял» | silence | 7337 | 41%      | 59%   | 0%      |
| Б «город»        | General | 2617 | 100%     | 0%    | 0%      |
| Б «город»        | Square  | 6170 | 0%       | 0%    | 100%    |
| Б «город»        | White   | 4793 | 0%       | 100%  | 0%      |
| Б «город»        | silence | 5620 | 39%      | 0%    | 61%     |
| В «генерал»      | General | 3329 | 100%     | 0%    | 0%      |
| В «генерал»      | Square  | 4714 | 0%       | 0%    | 100%    |
| В «генерал»      | White   | 4731 | 0%       | 100%  | 0%      |
| В «генерал»      | silence | 6426 | 98%      | 1%    | 1%      |
| С «середина»     | General | 3985 | 100%     | 0%    | 0%      |
| С «середина»     | Square  | 5763 | 0%       | 0%    | 100%    |
| С «середина»     | White   | 5612 | 0%       | 100%  | 0%      |
| С «середина»     | silence | 3840 | 21%      | 22%   | 57%     |

## Hour where the outcome is decided (greedy, 6/7/8 pooled)

| reading              | table            | distribution              |
| -------------------- | ---------------- | ------------------------- |
| R1 strict/literal    | А «поздно понял» | 04: 100%                  |
| R1 strict/literal    | Б «город»        | 04: 100%                  |
| R1 strict/literal    | В «генерал»      | 22: 100%                  |
| R1 strict/literal    | С «середина»     | 04: 69%, 05 (балкон): 31% |
| R2 strict/pair-stays | А «поздно понял» | 04: 100%                  |
| R2 strict/pair-stays | Б «город»        | 22: 100%                  |
| R2 strict/pair-stays | В «генерал»      | 22: 100%                  |
| R2 strict/pair-stays | С «середина»     | 22: 100%                  |
| R3 lenient/literal   | А «поздно понял» | 04: 100%                  |
| R3 lenient/literal   | Б «город»        | 04: 100%                  |
| R3 lenient/literal   | В «генерал»      | 22: 100%                  |
| R3 lenient/literal   | С «середина»     | 04: 68%, 05 (балкон): 32% |
| R4 strict/contest    | А «поздно понял» | 04: 100%                  |
| R4 strict/contest    | Б «город»        | 22: 100%                  |
| R4 strict/contest    | В «генерал»      | 22: 100%                  |
| R4 strict/contest    | С «середина»     | 22: 100%                  |

## DM steps per hour (mean, greedy, R1, 6 / 8 players)

| table                | 22  | 23  | 00  | 01  | 02  | 03  | 04  | 05  | total |
| -------------------- | --- | --- | --- | --- | --- | --- | --- | --- | ----- |
| А «поздно понял» (6) | 11  | 5   | 6   | 8   | 6   | 8   | 7   | 4   | 55    |
| А «поздно понял» (8) | 11  | 5   | 6   | 8   | 6   | 8   | 7   | 4   | 55    |
| Б «город» (6)        | 12  | 8   | 8   | 11  | 8   | 8   | 5   | 4   | 64    |
| Б «город» (8)        | 12  | 8   | 8   | 11  | 8   | 8   | 5   | 4   | 64    |
| В «генерал» (6)      | 12  | 8   | 9   | 11  | 10  | 9   | 7   | 4   | 70    |
| В «генерал» (8)      | 12  | 8   | 9   | 11  | 10  | 9   | 7   | 4   | 70    |
| С «середина» (6)     | 13  | 7   | 8   | 9   | 8   | 9   | 9   | 4   | 67    |
| С «середина» (8)     | 13  | 7   | 8   | 9   | 9   | 9   | 9   | 4   | 68    |

## Fight sensitivity: caller roster vs package statblock

| roster  | N   | spies/guards/deputies | escort: deputies out avg / taken≥1 / all fell / key | stall-and-rush: key / ≥1 taken / all fell |
| ------- | --- | --------------------- | --------------------------------------------------- | ----------------------------------------- |
| engine  | 6   | 2/1/2                 | 1.07 / 86% / 0% / 36%                               | 96% / 91% / 0%                            |
| engine  | 6   | 1/0/4                 | 3.17 / 84% / 0% / 0%                                | 90% / 80% / 0%                            |
| engine  | 7   | 3/1/2                 | 0.72 / 93% / 0% / 41%                               | 66% / 94% / 0%                            |
| engine  | 7   | 2/0/4                 | 3.08 / 92% / 0% / 14%                               | 99% / 94% / 0%                            |
| engine  | 8   | 3/2/2                 | 0.69 / 95% / 0% / 54%                               | 67% / 98% / 0%                            |
| engine  | 8   | 2/0/4                 | 3.07 / 93% / 0% / 26%                               | 100% / 92% / 0%                           |
| package | 6   | 2/1/2                 | 1.16 / 82% / 0% / 29%                               | 98% / 90% / 0%                            |
| package | 6   | 1/0/4                 | 3.20 / 80% / 0% / 0%                                | 90% / 82% / 0%                            |
| package | 7   | 3/1/2                 | 0.81 / 95% / 0% / 38%                               | 76% / 93% / 0%                            |
| package | 7   | 2/0/4                 | 3.07 / 93% / 0% / 10%                               | 99% / 92% / 0%                            |
| package | 8   | 3/2/2                 | 0.82 / 94% / 0% / 46%                               | 76% / 95% / 0%                            |
| package | 8   | 2/0/4                 | 3.08 / 92% / 0% / 22%                               | 100% / 91% / 0%                           |

## Balcony options available and what silence would give (greedy, 6/7/8 pooled)

| reading              | table            | Генералу avail | Белый avail | Площадь avail | silence → Генералу / Белый / Площадь |
| -------------------- | ---------------- | -------------- | ----------- | ------------- | ------------------------------------ |
| R1 strict/literal    | А «поздно понял» | 43%            | 43%         | 43%           | 0% / 100% / 0%                       |
| R1 strict/literal    | Б «город»        | 19%            | 19%         | 19%           | 0% / 0% / 100%                       |
| R1 strict/literal    | В «генерал»      | 10%            | 10%         | 10%           | 100% / 0% / 0%                       |
| R1 strict/literal    | С «середина»     | 31%            | 31%         | 31%           | 0% / 100% / 0%                       |
| R2 strict/pair-stays | А «поздно понял» | 42%            | 42%         | 42%           | 0% / 100% / 0%                       |
| R2 strict/pair-stays | Б «город»        | 5%             | 5%          | 5%            | 0% / 0% / 100%                       |
| R2 strict/pair-stays | В «генерал»      | 11%            | 11%         | 11%           | 100% / 0% / 0%                       |
| R2 strict/pair-stays | С «середина»     | 18%            | 18%         | 18%           | 0% / 0% / 100%                       |
| R3 lenient/literal   | А «поздно понял» | 100%           | 100%        | 43%           | 0% / 100% / 0%                       |
| R3 lenient/literal   | Б «город»        | 100%           | 100%        | 100%          | 0% / 0% / 100%                       |
| R3 lenient/literal   | В «генерал»      | 100%           | 100%        | 10%           | 100% / 0% / 0%                       |
| R3 lenient/literal   | С «середина»     | 100%           | 100%        | 32%           | 0% / 100% / 0%                       |
| R4 strict/contest    | А «поздно понял» | 42%            | 42%         | 42%           | 0% / 100% / 0%                       |
| R4 strict/contest    | Б «город»        | 20%            | 20%         | 20%           | 0% / 0% / 100%                       |
| R4 strict/contest    | В «генерал»      | 10%            | 10%         | 10%           | 100% / 0% / 0%                       |
| R4 strict/contest    | С «середина»     | 31%            | 31%         | 31%           | 0% / 0% / 100%                       |

## Exploit probes (R1, 6 players unless noted)

| probe                                                                                      | result                                                                         |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| А with green glass kept by a lie (NI already 6, so the +1 for the lie burns): greedy-White | Белый мандат 100%                                                              |
| А with green glass kept by a lie (NI already 6, so the +1 for the lie burns): pure-Square  | Площадь читает списки 98%, Белый мандат 2%                                     |
| А with green glass kept by a lie (NI already 6, so the +1 for the lie burns): pure-General | Знамёна генералу 100%                                                          |
| 04:00 strike, А «поздно понял»: NI + Кассия's glasses = 17 vs AR 6                         | Thread wins alone: True; three pairs stacked with the Dawn (12) flip it: False |
| 04:00 strike, Б «город»: NI + Кассия's glasses = 2 vs AR 2                                 | Орен предупреждён: strike fails whatever the pairs do                          |
| 04:00 strike, В «генерал»: NI + Кассия's glasses = 5 vs AR 4                               | Орен предупреждён: strike fails whatever the pairs do                          |
| 04:00 strike, С «середина»: NI + Кассия's glasses = 10 vs AR 5                             | Thread wins alone: True; three pairs stacked with the Dawn (11) flip it: True  |
