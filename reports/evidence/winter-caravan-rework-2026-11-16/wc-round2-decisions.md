# winter-caravan, round 2: binding decisions after the final critic's run simulation

Sources: `finale-sim/results.md` (the run confirmed an ending fixed at dawn) and
`finale-sim/results-tuned.md` (no allowed lever set alone makes the run decide; once the White's
start mark is known the run's losses are fixed). Decision of the session: apply the critic's best
set, all clarifications, and the one die the critic proposed, then rerun the simulator once.

## Levers

1. (a) Endings: «Исход решают люди, потерянные в беге: отрезанные завалом, оставшиеся на склоне и
   забранные Белой. Ушедшие назад и оставшиеся у Явры до вечера 8 исход не меняют — их называют у
   огня и показывают в последнем образе.» Change `world.json` `endings[].requires`, `run-dm-slide`,
   evening 8 and the evening-7 line «остался у Явры… считается недошедшим».
2. (c) «Стая идёт до 3 участков к самому заднему участку с людьми; мул без ведущего уходит вниз сам
   (мулов −1).» Replace «мул без ведущего стоит» in `run-rules`, `run-dm-card`, evenings 7–8, world.
3. (d) «В Горло (8) входят только с участка 7.»
4. (e) «Огонь на Отроге — один раз за бег» (was up to two) in evening 8, `run-dm-card`, `run-know`.
5. The die: «Огонь в хвосте держит стаю на 1–4 к6; на 5–6 она проходит огонь и кусает.» (resources
   reduce the risk — more fires, a sack — but cannot remove it).

## Clarifications (verbatim)

6. Evening-7 sledge choice: «два мула и четверо в постромках — сани идут по 2; два мула и двое или
   один мул и четверо — по 1».
7. «Огонь в хвосте и мешок — вместо хода: кто зажёг огонь или бросил мешок, остаётся в своём участке
   и в следующий ход идёт оттуда.»
8. «Огонь на Отроге, зажжённый в ход, когда Белая шагнула на К, откладывает сход на ход; зажжённый в
   ход, когда она уже стоит на карнизе, ничего не даёт.» «Кто жжёт огонь на Отроге, в этот ход стоит
   на Отроге: стая его не кусает и на нём не останавливается.»
9. «Огонь над завалом зажигают в шаге 2; в шаге 1 следующего хода Белая в этот участок не идёт.»
10. «Если на Завале нет других жертв, Белая наносит 11 урона одному засыпанному герою, ближе к Горлу;
    это её жертва на этот ход и считается в двух.»
11. «Сбитого, ослабевшего или обмороженного можно везти на муле, которого ведёт рука, — со скоростью
    мула.» «Если укус уводит мула с седоком, седок остаётся в участке.» «Мулов в санях ведут те, кто
    в постромках; отдельный ведущий им не нужен.»
12. «Слабость — помеха на проверки Силы и спасброски Телосложения» (one wording in `run-rules`, the
    sheet, evening 8).
13. Evening-7 benchmark «два огня» counts the fire-lighter's lag; README and truth «Плата»: «лист еды
    и тепла решает, сколько людей выходят в бег; понимание стаи решает сани и груз; кость огня и
    решения в беге — сколько из вышедших дойдут».
14. `players.html` subtitle (`world.genre`): «…волчья стая и последний бег к перевалу» (no «загнанная»).
15. `passing-pack` speaks of «стая» without a fixed number (6–8 by table).
