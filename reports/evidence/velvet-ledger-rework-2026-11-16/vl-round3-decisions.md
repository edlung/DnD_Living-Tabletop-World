# velvet-ledger, round 3: after the rerun of the bell simulation

Source: `finale-sim/results-final.md`. The rerun found a flaw in the tuning run's decision model
(the simulated table never opened shorts once a line read stopped lowering Курс); with it fixed the
round-2 text still gave the middle table about 95% «Перевёртыш». Decision, applied by the session:

1. «Сделка — СЛ 15, К +2 (6)» in `bell-rules` (was К +3). Simulated: middle table 45/48/52%
   «Перевёртыш» at 6/7/8 players (57/55/66% for a naive table), cautious and risky 87–100%, careless
   0%, lucky 100%; no single ally swings any table by more than 15 points. Сурьма's ally deal stays +3.
2. `bell-rules`: the sold judge's exception to R2 («проданный — к 12-му»), R4 («Порвать бумагу…:
   Издержки сняты, судья на крючке»), «Торг, а не бой» shortened to make room (1924 chars).
3. Evening 8 scene 2 choice: «Звоном отменить Надбавку или Издержки».
