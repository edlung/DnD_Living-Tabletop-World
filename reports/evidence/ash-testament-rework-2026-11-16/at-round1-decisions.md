# ash-testament, round 1: binding decisions after the logic and DM critics

Sources: logic critic (L1–L16), DM critic (D-items per evening). Editors apply every item exactly and keep
files consistent; limits of the writer guide; package ≤ 500 000 bytes at 8 players. Fix the source only;
the session rebuilds the pages.

## Fights (tuned by the session on the engine; prose must state exactly these)

1. Rosters at 5/6/7/8 players: «Жезл в пепле» дозорные 4/5/5/6; «Канат Верёвочной» ветераны 3/3/4/4 +
   заставщики 3/3/4/4; «Горелая роща» ночные наёмники 3/3/4/4; «Засада на Долгом настиле» ветераны Румы
   2/2/3/3 (первый всегда Платон) + стрелки Кондрата 2/3/3/4 + Кондрат. Fix every «трое», «двое
   ветеранов», «двое в тёмных плащах», «двое наёмников», «3+3», «по 4» in sessions, dmNotes, encounter
   `trigger`/`scaling`, `world.scaling`. Say the counts once per fight as «(по пакету: 4/5/5/6 на 5–8
   игроков)». At a gap of 3+ one veteran (not Платон) is removed: at 5–6 players only Платон remains
   and «Взят» through the infantry is impossible — say so.
2. Кондрат is the SRD `berserker`: КБ 13, 67 хитов, секира +5, 1к12+3, ONE attack. No two-handed sword,
   no crossbow anywhere (`cast.json` look, encounter `trigger`, `boss.description`, `tactics`). Delete
   «арбалет не снимает…», the «Поправка движка…» about the veteran/bandit captain and the old «Проверка
   на шести героях»; replace with one line: «Блок — берсерк SRD; проверено прогоном движка на 5–8
   игроков».
3. Кондрат leaves at the start of his turn with **27 хитов или меньше** (after 40 damage), not «с 40».
   «Дошёл» by an empty field only if Ефим stands in column **12 or further east**; otherwise the round
   goes on with Ефим's own step and the column.
4. Geometry by the printed map: on the bridge the party starts west, the foes east (columns 23–24, the
   engine seats them). Columns 20–24 are «под вышкой» (seen from Нелла's tower on the far bank), not
   «окружная земля»; the county marker (веха) stands beyond the east edge of the field, and Кондрат «за
   веху не идёт» means he never leaves the field eastward. Нелла's people stand on the tower, not on the
   planks. Do not give foe start squares by coordinates in prose: «противники — по карте пакета;
   Кондрат — у восточного края». The SVG letters columns A–X: add to `plank-card` one line «Столбцы на
   карте: A=1 … L=12, Q=17, R=18, T=20, X=24; ряд 1 — север».
5. Ferry fight, one end condition everywhere (encounter `objective`, evening 2 dmNote): «Бой кончается,
   когда канат перерублен (действие героя у ворота, Ефим на пароме) или половина противников выбыла».
   Note in the dmNote that the peaceful path is the short one.
6. Rules on `plank-card` and evening 8 (one wording): Ефим moves up to 4 cells when led; the leading hero
   ends next to him to keep leading. Misty Step is outside the 6-cell cap (one line). «Свой шаг»: Ефим
   stops next to the first foe. Заслон can turn an attack and also a «Взять». Crossbowmen do NOT shoot a
   fallen Ефим; Ефим dies only if he is still at 0 at the end of the next round (the 21+ line: no
   finishing off a helpless man). «Дошёл» needs «противники ушли или упали; колонна не в счёт».

## Ефим, Платон, the clues

7. Ефим's final HP, everywhere (`field-kit` item, evening 6 choice/consequence/spotlight, the grove
   `objective`, evening 8, `plank-card`): «12 хитов; 8, если он падал в роще и Пелагея его не
   перевязала».
8. `kill-order` in branch А1: on the planks in round 1 Платон says aloud «Кондрат платил людям. За тебя.
   Не за живого» (evening 8 scene 2 and dmNote); evening 6's А1 consequence: «ни расписки; слова Платона
   — на настиле». Платон's `knows` includes the boat (his `reveal` uses it).
9. Calendar: `truth[0]` «в разгар войны», not «в последний военный год». Фёкла: «день верхом».
   Evening 6: Ефим «Шесть ночей уже»; evening 7 ending: «Ефим спит впервые за семь ночей — лёжа, если
   флаг далеко; сидя у сваи, если близко» (and drop «у близкого флага» as a contradiction with «при Р 1 не
   спит»: at gap 1 he dozes sitting, he does not sleep lying).
10. Pressure: the spyglass sees gap ≤ 3 («Р 3 — в трубу у горизонта»); the mast book is needed from gap
    4 (evening 3 «Люди Олета»). Evening 4 «Ложный след»: «минус одна» applies only to the table that took
    the false trail — the 3/5/7 numbers state which choice produced them. Evening 3's three columns are
    labelled with the choices that produce them.
11. The consent rule: Ефим answers «мы в листе?» per asker («Ты — да» / «Тебя — нет, ты не дал»), never a
    group «Да». `transit-pass`: «допишите строки» (enough lines for 8, not «лишние вычеркнуть»), and
    «Если игрок забирает согласие — перепечатайте лист без имени, без объяснений в игре». `world.json`
    «Дошёл» cost and the evening 8 consequences say «согласившихся героев».

## Seats and table time

12. Heroes 6–8 (Леон Ключ, Ада Полынь, Осип Лён) and the core heroes without a job (Анфиса, Елисей):
    every evening 1–7 names in `spotlight` (or a scene's `choices`) one concrete job for each of Леон,
    Ада, Осип — scouting the next stage, witnessing at the mast, the night watch, the lantern on the gati,
    a letter, a ledger — without making them necessary. Evening 1: Леон hears the horn first (scene 1),
    Ада witnesses the surrender, Осип takes the post at Скол.
13. Осип's «свет» is a lantern/ward, not a spell he lacks (`cast.json`, the grove fight).
14. Evening 1: «Ефим на поле — 12 хитов» on the session page. Evening 3 scene 1 and evening 5 scene 1:
    one complication each, so the scene is worth 40–50 minutes (from what is there: a toll officer, a
    passing post rider, the burnt bridge's owner).
15. Evening 8: the duration line in the dmNote: «на 8 игроках бой длится 6–8 раундов, около двух часов;
    сократите сцену 1 до 15 минут».
16. Small: Арсен's named line in «Дошёл» (world and evening 8 «За вехой»); Агафья «А „нет“ — вот он»; the
    default formation in evening 8 scene 1 `failForward` for 5 and for 6+ heroes; vary the gestures of
    Ефим, Олет, Семён and Платон (only one «не поднимая глаз»); Роксана's `spotlight` on `players.html`
    must not name the former prisoners at Чаша.
