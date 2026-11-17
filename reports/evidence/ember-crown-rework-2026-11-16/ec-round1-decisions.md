# ember-crown, round 1: binding decisions after the logic and DM critics

Sources: logic critic (L1–L18), DM critic (D1–D20). Editors apply every item exactly and keep files
consistent; limits of the writer guide. The package is 491 KB at 8 players: every edit must be
size-neutral overall (trim repeated prose as you add); the 8-player package must stay ≤ 498 000 bytes.
Fix the source only; the session rebuilds the pages.

## The battle for the North Gate

1. Engine rosters (all prose, `world.scaling`, encounter `scaling`, `battle-dm-card`, evening 8 dmNote
   and scenes): at 6 / 7 / 8 players the starting field is stormers 5 / 5 / 4 + guards 2 / 2 / 3 +
   Ормунд Сайр, so **F = 7 at every size**; **Сайр starts on L1 at every size**. Starting cells — «по
   карте пакета» (no per-size cell lists in prose). Drop «D1».
2. The portcullis cannot be lowered before round 2. Сайр is never caught by it: if it falls while he
   is in the arch, he steps into the yard (row 2) first. Foes cut off by the portcullis count as fallen
   for the refill («доливка их заменяет»).
3. «Сорвать знамя» only when Сайр is on rows 7–12 or has 33 HP or less. Before round 3 Сайр does not
   withdraw (the 33-HP threshold applies from round 3).
4. `battle-dm-card` lists every end: «Знамя встало», раунд 8, «Сайр отошёл, сдался или упал, либо
   знамя сорвано — победа в конце раунда», «все герои выбыли — поражение». `battle-card`: «Уходить с
   поля — через южный край, ряд 12». Movement: «не больше шести клеток» (dwarves have 5).
5. Meyra's stretcher-bearers may empty a stair cell: say «это цена носилок» in one line.
6. Evening 8 «Последний образ»: the choice «Где стоят герои…» becomes one optional DM line («если
   стол хочет — один образ на героя, без круга»).

## The wall and the nights

7. Night 1 is softer: an empty sector loses 1, not 2, on night 1 only (so КД cannot fall to 0 on the
   first ritual).
8. Posts without the assault get a payoff that does not move banners. One `world.tableGuidance` item
   «Посты без штурма» (≤ 600 chars): under Вдова — they see the crew change and know which sector she
   shoots tomorrow; under Ворчун — tomorrow's assault target; under Жаровня — a pot that did not burn
   (one fire barrel next night); on РД — word from the river (one rumour from Борук or Эрдик). Every
   scene 4 points to it in one phrase.
9. Remove every skeleton section number from DM text («(2.1–2.5)», «(9.1)», «2.3», «2.4», «2.6»,
   «2.8», «3.2», «4.6», «4.10», «8.6» etc.): name the handout (`wall-scheme`, `night-order`,
   `battle-card`, `battle-dm-card`) or state the rule.
10. `wall-scheme`: one line «4–5 значит больше 1 только на воротах (СВ 5 — первая волна не ходит)»;
    one line «после вечера 4 вместо ВС — ЗБ (Зольная баррикада)». Do not announce green neighbour
    banners on the scheme (the DM adds them when the alliance happens).
11. The 8-player second storm is named in the dmNotes of evenings 3 and 4 (by Ворчун's target).
12. Water tower: heroes answering the bell enter at the start of round 2 on the east edge. If the ash
    barrels burn and no pair is on the Market, the boats turn back and the Market loses nothing.
13. Evening 4: «Полдень» gets one line for a table whose East already fell («Восток пал ещё ночью;
    теперь садится башня»). `coal-tower-breach` terrain: one sentence placing Зольная баррикада
    consistently with the gate map. Evening 3's «утром увести семьи» is the same discount as evening 4
    scene 1 (say so).
14. Evening 6 «прорваны два участка»: the fallen East counts only if Зольная баррикада is at 0.

## The «mercy», continuity, seats

15. `baggage-order`: cut the list of quarters; keep «триста мастеровых семей» (the list is the evening 5
    reveal). `erdik-terms`: do not name Брод on the handout.
16. `full-mercy`: Лессара's bracketed note is marked «(только в копии Лессары)». Evening 7: Лессара's
    quiet path needs «копия или подлинник».
17. `ash-foundation` clue: «К полудню завтра». Courier/truth/Риорд's `knows`: «в день, когда рухнет
    Угольная башня».
18. Борук: evening 4 «Зольная баррикада» — «(если укрыт)»; the evening 2 choice «Отослать» becomes «не
    брать под защиту»; evening 8 images with Борук — «если он в городе».
19. Endings: «Венец стоит» — «рабочие семьи остаются свободными, кроме отданного квартала» (world
    `endings[0]` and evening 8 consequence).
20. Evening 7/8: one line that the column's pair is back by dawn for the battle (and Мейра returns if
    РН ≥ 1, as written).
21. Evening 6: if the table never went to the Hill, in evening 7 Эрдик sends a messenger himself: same
    terms, the neighbours come one round later.
22. Idle seats: evening 5 — the third pair escorts the released captives (one short beat in scene 3,
    with a question to Лессара's man); evening 6 — the forge group gets its own thread in scene 2 (the
    torch-bearers' preparations seen from the passage), switching with the Hill.
23. Sortie, evening 2: «сбить раму» instead of cutting the cable and knocking out the pin (no siege
    mechanism).
24. README: the full list of what moves banners by day (incl. the Coal hundred's return, the reading to
    the lower town, the chain, the column). Remove «(сессия уточняет на движке)» from `world.scaling`.
25. Vary repeated signature lines (Мейра «Списки…» in evenings 3 and 4; Эрдик «Одни мы не стоим»).
    Keep children in evening 7's column off-screen at the enemy post.
