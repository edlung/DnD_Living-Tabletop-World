# Combat rehearsal evidence

`encounters.md` groups the 183 encounters by title. Each line of `editions.jsonl` covers one encounter and one composition. The primary key consists of `campaign`, `key` and `edition`. `rechecks.json` retains the paired earlier and corrected rolls plus the independent series for the ten changed encounters.

`objective.results` records the book objective. For Glass Republic the three measures can overlap. `pressure` records the open fight. Round counts, final hit-point loss percentages and counts of distinct fallen heroes are sums over trials. `zero` counts trials with at least one fallen hero. Dice keys are side counts. The six specialist models return story outcomes and keep their dice inside their own simulation.

The primary engine and pressure batches use indices from zero. The specialist seed base is 20261122 plus party size. Independent rechecks begin at 3000 in Hollowmere and 5000 in the authored campaigns. Rerun with `pnpm campaigns:balance` into a fresh directory.
