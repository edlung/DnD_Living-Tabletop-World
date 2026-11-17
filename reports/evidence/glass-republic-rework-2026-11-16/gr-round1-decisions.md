# glass-republic, round 1: binding decisions after the logic and DM critics

Sources: logic critic (L1–L18), DM critic (D1–D18). Editors apply every item exactly and keep files
consistent; limits of the writer guide; the 8-player package must stay ≤ 498 000 bytes (it is ~472 KB).
Fix the source only; the session rebuilds the pages.

## Fights (tuned by the session on the engine; prose must state exactly these)

1. «Вывод по списку» at 03:00, 6 / 7 / 8 players: бойцы дверной команды 2 / 3 / 3 + караульные Палаты
   2 / 2 / 3 + Зенон Карх. Starting squares «по карте пакета» (no square lists in prose). Fix
   `world.scaling`, encounter `scaling`/`trigger`, session 8, `index`-facing text. The night modifier:
   «АР 3–4 — на одного бойца меньше; АР 0–2 — бойцов дверной команды нет, только караул и Зенон».
2. «Угол Медного спуска»: «тихие» 3 / 4 / 4 by the package (not «двое»). One win rule everywhere
   (encounter `objective`, 3.3 `choices`, evening 3 dmNote): «Ростислав спасён, если в конце раунда 5
   он не на столбце A; дошёл до столбца N раньше — бой кончен сразу». The quiet ones withdraw when he is
   **east of column M** (not K).
3. «Белые нитки у сада»: Иветта's pairs stand on M5–M8 (west of the squad on the gate), not «за
   спиной».
4. The gorget (`guard-gorget`): one rule everywhere — «в начале боя снимает одного караульного (до
   раунда 1)». No bonus action.
5. Deputies on the bench: «после всех поправок на скамье остаётся не меньше одного»; if Зенон yields,
   the deputies his people release count as «выведены».

## The night and the balcony

6. Silence, one rule (in `night-dm` 05, session 8 scene and consequences, `world.endings`, README):
   «Молчание: читает лидер того, кто держит Парадные двери (ПД) после 04:00; удар Нити отдаёт ей ПД
   только там, где их держал Рассвет». «Площадь» comes only from the squad's explicit choice to let
   Юла out. The balcony key gives the squad the right to stand on the balcony and choose; without the
   key — silence. Remove «или ключ от балкона был у отряда» from `endings[2].requires`.
7. Any other text read on the balcony (e.g. «Знамёна — Палате», the squad's own) — «полки не
   исполняют: это молчание».
8. «Площадь» without the margins or Тера's copy: Юла reads sheet three alone — still «Площадь»; the
   margins and the copy change only who the square curses in the last image. The last image names
   «Юла или тот, кто вышел».
9. Empty ПД and the strike: one sentence each in `night-dm`, `night-card`, session 8: «В 03:00 Рассвет
   закрывает ПД, если там нет пары отряда»; «ПД, которые никто не держит, — за Городом»; the 04:00
   strike adds НИ and every house whose glass is with Кассия (list them as the formula). A glass house
   whose side the squad named stands where they named (`night-card` wins over the dmNote).
10. 04:00: «Палата открыта изнутри: пары встают где угодно».
11. Evening 8 time: dmNote line «около трёх часов на шестерых, до четырёх на восьмерых»; scenes 30 /
    40 / 80 / 30.
12. A DM-only handout «Лист ведущего» (≤ 1200 chars, key `dm-ledger`, listed in evenings 1 and 8):
    postponed lies, which of Т1–Т4 (named in full: the four exposures) were used, the first showing per
    leader, Матиас's deals, the four facts of the night.

## Truth, continuity, clues

13. Timeline: Кассия got the first page **twelve days** before evening 1; the squad was gathered nine
    days before; Ростислав has carried her letters to Зенон for two weeks; Северина signed the
    resignation «две недели назад» and `resignation-letter` is dated «за четырнадцать дней до
    Возвращения». Fix `truth`, `cast` n-vera `knows`, evening 5 dmNote.
14. Ростислав after 3.3: if saved — hidden in Иветта's quay workshop; if taken — held by the Seventh
    Room. Evening 5 `readAloud` and 5.1 name both cases (the workshop; or Знамённый двор, where Зенон's
    adjutant admits the squad — not Богдан). Evening 3 consequence: «у Седьмой комнаты до торга в
    вечере 6». Evening 6: «уйти с последней парой» (6.3) only for a saved Ростислав; a taken one is
    handed over by Орен in 6.4 and Иветта leads him out separately at night.
15. The fold office: «копирует, не читая, только почту седьмого стола»; Кассия does not know about the
    copy journal (`forget-order.fallback`, Фабиан's `boundary`, evening 4 consequences). Evening 5:
    Фабиан's runner brings the journal copy and the copying glass at the start of 5.1 (so a table that
    burned the order still has «одна рука»).
16. Evening 1: returning the order also gives Нить +1 (Кассия asked «сожгите или верните»).
17. One faction per scene: the scene's faction is the table's focus; any other faction's change is
    announced at the end of the scene as «эхо» with number and reason (2.3 letter → ТД +1; 3.3 ТД).
    Reword the rule in evening 1 dmNote and `tableGuidance`.
18. Evening 5.2: «ложь вечеров 2–3». Evening 4.2: «в этот вечер Юла из Зала не уйдёт».
19. Богдан: `cast` reveal — «увидев список, колеблется; без бирки или услуги — СЛ 14 (вечер 7)»; 3.2
    «а не ящики».
20. Glass tokens, one description (README, `faction-sheet` unlock, `tableGuidance`, evening 1
    dmNote): six coloured chips for influence on the sheet + the house glasses (list which houses have
    one). One line: «стекло резерва тоже читает зелёные строки» (the squad's second glass is green).
21. Матиас: «обещание, данное при Матиасе, засчитывается +1 сразу» (instead of «исполненная сделка не
    станет ложью»).
22. «Ориентир» numbers (tables А / Б / В after the evening) in the dmNotes of evenings 3–7, one short
    line each.

## Seats and table

23. Кассия's evasive line in 2.4: «Генерал считает нас друзьями. Пусть считает».
24. «Двумя делами» from six players, not only 7–8 (`tableGuidance`, scenes 1.3 and 4.1 name the second
    job).
25. Гелена's catchphrase differs from Энна's («вопрос задаёт один раз»).
26. Ора's bag: «цветные стёкла для праздничных огней, без янтаря».
27. 4.1 and 5.1: the house in the title says aloud «без изменений» when nothing moves.
28. Remove service references from DM text («2.4 п. 5а», «Т1–Т4» without names, skeleton section
    numbers): state the rule or name the handout.
