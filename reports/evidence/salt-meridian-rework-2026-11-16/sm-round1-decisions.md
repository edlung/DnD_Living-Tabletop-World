# salt-meridian, round 1: binding decisions after the logic and DM critics

Sources: logic critic (L1–L15), DM critic (D-items per evening). Editors apply every item exactly and
keep files consistent; limits of the writer guide; package ≤ 500 000 bytes at 8 players.

## Fights (tuned by the session on the engine; prose must state exactly these)

1. Rosters at 5/6/7/8 players — «Пломбы на Узле»: guards 4/5/5/6. «Огни над Зубцами»: reef warriors
   3/3/4/4. «Абордаж „Ласки“»: sailors 4/5/5/6 + the skipper (one). «Сто Вымпелов у борта»: «Абордажник
   флагмана» 2/2/3/3 + Кречет; sailors of the flagship at alarm 7+ are NOT in the package — remove that
   line (no off-field reinforcements). «Цепной Камень»: «Сторож цепи» 2/2/3/3, «Абордажник флагмана» 1,
   reef warriors 1/1/1/2 (they fight only if the reef people are hostile; otherwise the DM removes them),
   Кречет. Fix `world.scaling`, encounter `scaling`/`tactics`/`trigger`, session texts and dmNotes;
   no «до трёх…» style counts.
2. Кречет's block is now `berserker` (КБ 13, 67 хитов, секира +5, 1к12+3; no pistol — «Пушек и пороха
   в Дуге нет»). He surrenders at 10 HP or less (both fights). Update his description/prose.
3. Geometry by the printed map: `knot-pier` (dock): party starts on the EAST edge, guards from the
   west — move the bell to the city end (west, about B5) and say the bollards are on the east quay;
   `pennants-alongside` and `laska-boarding` (ship-deck): party west, foes east — the skipper holds
   the mast mid-deck after advancing; `chain-rock-battle` and `reef-lanterns` (reef): party south,
   foes north. Name objective squares in the text (bell, bollards, hatch, wheel, brake J2, mast).

## Evening 8 rulings (one box in the evening 8 dmNote and on `strait-chart`)

4. Тар goes with the party from round 1 (lands with them at J12 and moves at his speed); delete «тихая
   сторона» or name its square.
5. «Флагман у якоря никого не берёт» (alarm 0–6); at 9–10 «Сойка» runs aground at C3.
6. The patrols are within two cables of the rock: the signal is seen in white water.
7. After Кречет surrenders, the brake holder may let go at the end of the strait phase and is taken
   off by the flagship's boats — alive, a prisoner of the truce (show this fate in the ending). The
   price «коридор куплен кровью» is then paid by someone else in the last image (Тар wounded on the rock
   or a named sailor) — no forced hero death; consent rules stand.
8. In `strait-chart`: «сначала из своей клетки», the order ships move, «флагман действует с хода 4/2»
   (not «ходит»), drop «вбок в ряду 3».
9. The flag «лечь в дрейф» on «Сойка» is П-П (not Б-С).

## Calendar, continuity, economy

10. (L1) Campaign days are in the month after the admiral's death: retitle `tide-table` and the
    readAloud dates of evenings 3, 4, 8 (e.g. «Рыбный месяц»); `pitch`: «на двенадцатый день». The
    order «от третьего дня» refers to the previous month. Fix `flag-code` and `picket-book` accordingly.
11. (L5) Филат: one line in evening 3 that he goes to Чаша; in evening 7 his lines go to the barge's
    skipper or Евдокия; remove his `knows` item about «Пескарь».
12. (L6) Evening 1 consequence[0]: the effect moves to evening 2 (the cutter does not inspect a
    transport under intact lead).
13. (L7, D) «Ласка» taken as a prize: she becomes the crew's boat to the rock in evening 8 (one line in
    evening 6 dmNote and evening 8).
14. (L9) The alarm track lists «журнал отдан Инне: +1» (`alarm-track` and evening 1 dmNote).
15. (L10) At most one «−1» per evening (beyond the evening's own rules), and keeping ships in row 2
    before the signal costs one water step (the tide falls) — state on `strait-chart`.
16. (D) Evening 2: Кошачий лаз is «тихий проход −1» as evening 1 says. Evening 1 scene 3: if the seals
    are intact, «Сойка» still asks to look in the hold (a complication with a no-roll path).
17. (D, L14) Replace references to skeleton sections («по 2.2», «(2.3)», «(3.7)») with «по правилам
    вечера 1» or the rule itself.
18. (D) Evening 6 scene 2 keeps the patrol cutter and the current as a challenge even when Инна has
    seen the order. Evening 7: one timed pressure beat in the fog (a guard change).
19. (D) Seats 6–8 and the large table: each scene names one «судовая работа» for extra hands (helm,
    lookout, lines, lantern discipline, people of Чаша, the boat). Денис Ветр gets the fog and weather
    in evenings 2 and 7.
20. (D) `players.html` sources: each core hero's `hook` names their item (кошка, карта, шторный фонарь,
    солемер, топор).
21. (L15) Evening 4 scene 1: remove the choice «кого сажать в лодки первыми».
22. (L13) Knot pier at dusk on full water: drop «отлив тянет». The tide sheet's labels «Вечер 1…8»
    become in-world dates.
