# ember-crown: simulation of «Битва за Северные ворота» (evening 8), final critic

Date: 2026-11-16. Simulator: `gate_sim.py` (this folder), report builder `make_report.py`, raw numbers
`results.json`. 400 runs per cell, no network, nothing in the campaign edited.

## What the simulator models (from the text only)

Sources: encounter `battle-for-the-gate` (objective, tactics, terrain, scaling), handouts `battle-card`
and `battle-dm-card`, evening 7 and 8 scenes and dmNotes, `world.endings`, `night-order`, `wall-scheme`,
starting cells from `variants/N-players.json` (heroes F12–K12 / E12 / L12, foes H1 I1 G1 J1 F1 K1 E1,
Сайр L1; cover G4, J4–J6, K5–N5, G9–I9; H4 difficult; the SVG maps agree).

- Field 16×12, 8-way grid, diagonal = 1, difficult = 2; no passing through foes; foes enter only via the
  arch and open A7/P7; heroes never use the arch.
- Round order exactly as printed: start — neighbours arrive → refill → side entries; turns by individual
  initiative; end — volley → neighbours remove one → «В ворота!» → portcullis falls → stretcher-bearers →
  end check.
- Refill «до F» / «до F−1» in the rounds the dawn sheet gives (Ворота 4–5: F−1 in 3, 5; 2–3: F in 3, 5;
  0–1: F in 3, 5, 7; 0: Сайр moves from round 1; 5: arch foes only throw spears in round 1). F = 7, Лессара −1
  (removes the E1 guard). Side entries: 2 fallen at the start of rounds 2 and 4, carried over when no fallen.
- Portcullis: action on A2 from round 2 (chain intact), falls at end of round; Сайр in the arch steps to
  row 2; other arch foes become fallen; arch closed for refill and for the neighbours.
- Volleys: Вдова G9–I10 (end r1), Ворчун K10–M11 (end r2), Жаровня E6–G7 (end r3 unless silenced; then
  difficult). DEX DC 12, 2d6, half. Heroes avoid the coming zone; foes do not.
- Сайр: r1–2 stays on L1, hits only a neighbour; from r3 shortest path to a free G12–J12 cell, hits a
  neighbour; raises the banner (action) on a free stair; all stairs taken → hits the lowest-HP stair hero;
  prone hero on a stair → shifts him (action). Threshold: ≤33 HP at the end of his own turn from r3 → next
  turn Dash (12) to the arch: leaves if the arch is free, else surrenders on rows 1–2. Guards from r3 stay
  next to him; stormers press heroes on the stairs and at A2. Nobody hits prone heroes.
- «Сорвать знамя»: action next to Сайр when he is on rows 7–12 or at ≤33 HP; Athletics vs d20+3,
  repeatable; success = victory at the end of the round.
- Neighbours: signal (Оллир's horn, bonus) in r2 → arrive at the start of r4 (late alliance r5; no signal r6);
  no refill once arrived; remove one foe on rows 1–3 per round until let in.
- Stretcher-bearers (Рынок 1+): end of round, the downed hero nearest the arch to a free A12–F12/K12–P12
  cell with 1 HP; a vacated stair stays empty.
- Heroes: party = first N of `cast.json` (Тарна F, Оллир R, Радея C, Демек W, Вонда F, Суня R, Нель C,
  Ирса W) with the brief's numbers: fighter 31/11 longsword +5 1d8+3, Second Wind ×2; rogue 24/13 rapier/
  shortbow +5, sneak 2d6 (ally adjacent), Cunning Action dash; cleric 24/11 staff +3 1d6+1, Healing Word ×4
  2d4+3 (revives only); wizard 20/12 Fire Bolt +5 1d10, Misty Step ×2 inside the 12-cell limit. Athletics:
  fighter +5, cleric +1, rogue +0, wizard −1. Foes: stormer AC 13 9 HP, guard AC 16 11 HP, spear +3 1d6+1;
  Сайр AC 13 67 HP greataxe +5 1d12+3. Crits double dice. Opportunity attacks are not modelled.

**Table policy (sensible greedy, «A базовая политика»).** The four heroes who start on G12–J12 hold the
stairs and never leave; they attack or tear when Сайр is adjacent, ranged heroes shoot Сайр. Free heroes
fight the nearest foe in rounds 1–2 and go for Сайр from round 3, tearing whenever legal. Оллир blows the
horn in round 2 if allied. A non-allied table sends Суня to A2 (dash r1, portcullis r2); an allied table
keeps the portcullis up and shouts «В ворота!» as soon as the arch is empty. Healing Word only on downed
heroes, Second Wind under half HP. A free hero fills an emptied stair.

## Dawn states («как текст выводит»)

Recomputed with the current night order (night 1 softer, «Посты без штурма» move nothing) along the
skeleton's three table profiles; the 7th/8th heroes cover the loner / second-storm sector and do not change
any dawn flag in these profiles, so the same dawn is used at 6, 7 and 8.

| Стол       | Ворота            | ЗБ   | Рынок | Камыш | Мастерские | A7      | P7         | Носильщики | Жаровня | Цепь | Соседи     | Лессара | Невыведенный прорыв                  |
| ---------- | ----------------- | ---- | ----- | ----- | ---------- | ------- | ---------- | ---------- | ------- | ---- | ---------- | ------- | ------------------------------------ |
| понемногу  | 3 (до F в 3, 5)   | 2+1с | 2     | 4     | 4          | закрыта | закрыт     | да         | молчит  | цела | по сигналу | F −1    | нет                                  |
| ворота     | 4 (до F−1 в 3, 5) | 0    | 0     | 4+1с  | 4          | закрыта | **открыт** | нет        | бьёт    | цела | по сигналу | F −1    | нет (слобода, Рынок, Камыш выведены) |
| бросил низ | 4 (до F−1 в 3, 5) | 0    | 0     | **0** | 5          | закрыта | **открыт** | нет        | бьёт    | цела | нет        | нет     | слобода, Рынок, Камыш                |

Note: with the softer night 1 the «бросил низ» table's Камыш survives night 1 at 1 and falls on night 2
(Жаровня, nobody there) — same dawn as the skeleton's table.

## Results — base policy, 400 runs per cell

{{BASE}}

## Readings, exploits and sensitivity (400 runs per cell)

B — no banner tearing; C — everyone rushes Сайр from round 1; D — portcullis always dropped in r2;
E — never dropped; F — dwarves 5 cells; G — guards stay by Сайр in r1–2; H — no tearing, no portcullis;
I — «бросил низ» accepts the evening-7 messenger (late alliance); J — foes taken by the neighbours are not
«fallen» for side entries; K — «понемногу» at Ворота 0; L — «ворота» at Ворота 5; M — threshold counted at
any moment (not only at the end of Сайр's turn); N — Athletics ties go to the hero; O — rush + portcullis.

{{READINGS}}

## Candidate fixes (not campaign text; for the owner's decision)

X1 — tear only when Сайр is on rows 11–12 (or ≤ threshold), one attempt per round for the party;
X2 — X1 + threshold 20; X3 — X2 with the rush tactic; X4 — X2 + Сайр AC 16 and two attacks;
X5 — X4 + a downed hero no longer blocks a stair (Сайр may raise the banner next to it).

{{FIXES}}

## Findings

1. **The battle is decided by «Сорвать знамя» in round 3–4, almost regardless of the dawn scale (high,
   design).** Victory is 99–100 % at every size for all three tables, including «бросил низ». 80–90 % of
   fights end by tearing. Cause: Сайр moves exactly 6 cells in round 3, from row 1 to row 7, which is the
   first row where tearing is legal; any free fighter (+5 vs +3, 57 % per try) can reach him, and every
   adjacent hero may retry. `battle-for-the-gate.objective` / `battle-dm-card` «Сорвать знамя — только когда
   Сайр на рядах 7–12 или у него 33 хита и меньше». Without tearing (B, H) the party still wins 93–100 %:
   six level-3 heroes deal ~35 damage per round to a 67-HP AC 13 boss, so the 33 threshold (34 damage) falls
   in one round of contact. Defeat endings «Уход по Камышовой» / «Пощада» are practically unreachable for a
   table that plays sensibly; the scale only picks the cost line.
2. **Four stair cells + «на занятую клетку он не встаёт» + prone heroes keep the cell = the stairs cannot be
   taken (high, design).** The only route to «Знамя встало» in the sims is Мейра's stretcher-bearers
   vacating a stair («цена носилок»): the best-played table («понемногу», Рынок 2) is the only one that ever
   loses (≈1 % at 6). Even with a tougher Сайр (X4) defeat stays ≤ 9 %; only X5 (a downed hero no longer
   blocks) puts the defeat endings in play (14–29 % at 6 players).
3. **Ворота 0 gives the fastest win (medium, inverted incentive).** «при 0 Сайр идёт с раунда 1» puts him
   on row 7 at the end of round 1; tearing ends the fight in 1.5–1.8 rounds (K, p90 = 2–3). The worst gate value is the
   best case for the heroes.
4. **The rush exploit: tearing at ≤33 HP has no round gate (medium).** Rushing Сайр on L1 (dash in r1,
   focus in r2) brings him to ≤33 and tears in round 2: mean 2.5 rounds (C, O), ending before any refill,
   side entry, volley 2–3 or neighbour arrival. The text forbids his withdrawal before round 3 but not the
   tear.
5. **Waves, volleys 2–3, side entries and neighbours rarely act (medium).** p90 = 4 rounds: refill in round 5
   and 7 essentially never happens; neighbours (signal r2 → r4) arrive only in fights that reach round 4, so
   the «Соседи» cost appears only if an allied table drops the portcullis (D: 40–69 %), and the text gives
   an allied table no reason to drop it. The encounter claims «Правило держит бой 4–7 раундов» — the sims
   give 3–4 (mean 3.4–3.8). Evening 8 budgets 60 + 60 minutes for rounds 1–4 and «раунд 5 и дальше»; scene 3
   «Знамя на ступенях» is mostly empty.
6. **Portcullis** (low): by the end of round 2 the arch usually holds only Сайр, who steps into the yard, so
   it cuts nobody off; its effects are «no refill through the arch» and «Сайр surrenders instead of leaving».
   **Misty Step** is irrelevant (the 12-cell cap is never binding for reaching Сайр). **Dwarves 5** (decision 4) is not in the text; it changes nothing (F).

## Ambiguities a DM must rule on (both readings simulated where they matter)

1. «33 хита или меньше в конце хода» — end of Сайр's own turn (base) or any moment (M): only the finish type
   changes (withdrawal instead of tear), not the outcome.
2. Guards in rounds 1–2 are unscripted (base: press like stormers; G: stay by Сайр). No outcome change.
3. Banner raised and then torn in the same round: both are «в конце раунда»; which wins is unstated (sim:
   the banner wins). Rare (≤ 1 %).
4. Neighbours and a lowered portcullis: do they still remove foes through it? Are removed foes «fallen» for
   the side entries (J)? Not exercised by a sensible table.
5. Can heroes stand on row 1 outside the arch (A1–D1, M1–P1, the towers)? Silent; matters for the rush.
6. Side entries are not capped by F; tie in the Athletics contest (N) — no outcome change.
7. «Сайр отошёл»: reaching an arch cell vs leaving the map on the next move (sim: reaching the arch).
8. Opportunity attacks against Сайр's path are neither excluded nor mentioned.

## Dead states / oddities

- No soft-lock found: Сайр always has a path or a body to shift; stretchers always find a free row-12 cell.
- «Сайр в следующий ход отходит» after a tear is moot: the fight ends at the end of that round.
- Evening 8 scene 2 «пока врагов без Сайра не станет столько, сколько записано: «Доливка до семи»» — an
  example that is wrong for every printed dawn here (6 or 5 after Лессара / F−1).
- `world.endings[0]` cost 2 «Борук считает телеги вслух» lacks «если он в городе» (decision 18 applied only
  in evening 8).

## Decisions per round and table time

Per round: 7–9.4 hero decisions (one per hero turn plus bonus actions), 6.3–7.9 foe turns, 2.2–3.8 DM
procedure steps. Estimate at 1.5 min per hero turn, 0.5 min per foe figure, 0.5 min per DM step:

{{TIMES}}

So the fight takes ~45–60 minutes of the 120 the plan gives it; evening 8 runs about 2 hours, not 3.
