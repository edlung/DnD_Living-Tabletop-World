# hollow-choir, round 1: binding decisions after the logic and DM critics

Sources: logic critic (L1–L16), DM critic (D1–D20). Every item is decided; editors apply it
exactly and keep all files consistent. Limits: writer guide (session goal ≤ 190; package
≤ 500 000 bytes at 8 players — check with `size.mjs`). The DM critic's claim that SVG tokens are
drawn off the grid is wrong (tokens and grid share one translated group); no action.

## The house's rule of taking

1. (L1, D4) «Первая трапеза»: if the objective is met (enough candles burning in the south half at
   the end of round 4 — state the number per table: 3 at 5–6 players, 4 at 7–8), nobody more is
   taken; if not, the first unprotected person in the queue is taken. A person a servant dragged to
   the wall is taken INSTEAD of that person, never in addition. Write this exception into the world
   truth, the encounter objective, evening 2 scene 3 check/failForward and consequences.
2. (L2, D10) When everyone is protected, the house only puts out candles and takes nobody. Fix
   evening 3 scene 3's example («гасит свечу ответившего; никого не берёт»).
3. (L3) Each niche candle stops the Choir's line once per flight: «каждая ниша срабатывает один раз
   за бегство», whatever is placed later.
4. (L4) Urm candles: on a strike the house puts them out last, at most one per strike, and each
   holds only its holder and one person holding on (not three). Update item `urm-candles`, truth,
   evening 4–5 texts that rely on them.
5. (L8) Gaspar's full name: he never says it — the opening line becomes «Гаспар. Входите.» Naming
   him in full works from 02:00 (the hour he is seen whole); drop the unexplained «после 03:00».
6. (L11) Accepted as designed: a cautious table that stays together and whispers gains only +1
   per hour. Write one sentence in evening 1 dmNote that this is the reward of caution and that the
   house still takes one guest at 01:30 regardless.
7. (L12) «Мудрость СЛ 12 или ответ»: a failed save is not an answer; a roll never forces a hero to
   answer the Choir (boundaries). State once in evening 1 dmNote and in the boundaries.

## Counts and maps

8. (L5, D7, D11) Real rosters everywhere (encounter `scaling`, triggers, session dmNotes, prose):
   «Первая трапеза» 2 Voices + 1 servant at 5 players, 2 + 2 at 6, 3 + 2 at 7–8; «Сторожа ниш»
   3/3/4/4 guards; «Стекло поёт» 3/3/4/4 servants; the flight 2/2/3/3 servants + the Gatekeeper.
   Every crypt guard has a name plate in `niche-names` (add the third and fourth names, adults).
9. (D5) «Первая трапеза» geometry must match the map (great-hall: party south, foes north): the
   heroes and guests sit at the long table in the south half; the kitchen door and the servants are
   at the north wall; dragging a person «to the wall» means to the north wall. Add: before the first
   candle is relit, every attack except the Voices' has disadvantage (darkness rule, D6).
10. (D14) «Стекло поёт» geometry: the cut-off group starts at the south edge with the rest; the
    servants come from the north between the tubs; doors are named by compass side.
11. (D16) The flight is renumbered to the printed map labels (row 1 at the top = north): new row =
    15 − old row. Party starts at rows 12–14 (south, by the clock case); landings with niches at
    rows 10 and 5; the gate is beyond row 1 in the north wall (columns D–E); servants start in rows
    2–3, the Gatekeeper in row 1. «Вниз» means towards row 1. The Choir comes from the south edge
    (its line starts below row 14 and moves to smaller numbers). Apply in `six-strokes`
    (terrain/trigger/objective/tactics/scaling), `stair-card`, evening 6 scenes and dmNote, and any
    item or clue that names a row.
12. (L6, D17) Wording of the line: «за чертой» = the line's row and every row behind it (caught);
    «перед чертой» = the row just ahead of the line (where one stands to pull someone out). Never
    «под чертой».
13. (L9) Entering the stair without the key: the breakers enter rows 12–14 in round 2 and move
    normally; the Choir starts at the end of round 1 from the south edge at any hunger.
14. (D18) `stair-card` gets a DM block (it may become two handouts: `stair-card` for players and a
    new `stair-dm` for the DM, each ≤ 1900 chars): Gatekeeper rule (blocks all but fire until he is
    at 18 HP or less), servants' priority, starting rows, the gate passes everyone who reaches it
    (no queue), round-2 entry, a line to record «отпущен, раунд N» and who the Choir called last.

## Pacing, spoilers, consent

15. (D8, D19, D13) Evening 2: scene 3 (the taking and the fight) gets 50 minutes, other scenes
    shorten to keep the evening's total. Evening 6: scenes 1–3 together ≤ 55 minutes, the flight
    scenes get the time (the flight ≈ 100 minutes at 6 players); state 120 at 8. Evening 4: the
    crypt scene gets 45 minutes.
16. (D12) Evening 4 box: a hero can hand the box to an adjacent hero (free, once per turn); the
    deadline is the end of round 6.
17. (D9) Player pages: remove from `pitch`, `setting`, boundaries and any player-facing text that
    the taken are alive in the walls and that a person can be pulled out by name. Boundaries keep a
    neutral line: «героя могут забрать; игрок продолжает играть (см. правила стола)».
18. (D20) Consent: before evening 1 the DM asks each player whether their hero may be taken and may
    «come out not oneself». If no, that hero is skipped by both rules and the role passes to the next
    eligible guest. Evelina's drops never affect a hero against the player's will. Put this in
    `tableGuidance` and the evening 1 dmNote.
19. (L13) «Не собой»: the rule keeps «из вышедших» in every fallback; final fallback «иначе —
    последний прошедший ворота». Fix the garbled «Конец — после раунда 6, если…» (use «или»).
20. (D3, L14) No fixed head counts: «двенадцать тарелок / вас тринадцать / стол на 13» become «на
    одну тарелку меньше, чем вас» etc. State whether the 06:00 strike applies candle loss before the
    flight (it does not: the strike of six only opens the stair).
21. (L7, D1) Book of the Threshold: Egor writes only himself (row 1); everyone else signs in the
    order they take the pen; `threshold-page` shows Egor's row and empty rows. Egor's `knows` does
    not include Martin.
22. (L10) Hunger examples: add cautious/middle/noisy numbers for 05:00 and 06:00 to evening 5 scene 5,
    evening 6 and the DM stair block; check the Choir's speed bands 1/2/3 still make the flight a
    threat for the middle table (≈ 16–18) and a real race for the cautious table (≈ 9).
23. (D15, L15) Optional seats: give Иероним and София one hook line each in evenings 2, 4 and 6;
    never required.
24. (L16, D notes) Small: Egor's carriage card in one mailbox (the carriage's); the bait item's
    origin «из снаряжения»; «Первый удар шести» becomes «бой шести»; `plan-two` drops «Гостиная — на
    месте» if everything moved; Beata's AC line says she has a shield but no armour on the sheet
    (AC 11 as printed); the Book's wax drops match the number of crypt plates; a DM-only hunger
    threshold table in evening 1 dmNote (compact, one line per threshold).
