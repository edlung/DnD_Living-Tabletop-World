import {
  ABILITIES,
  POINT_BUY_BUDGET,
  POINT_BUY_COST,
  STANDARD_ARRAY,
  type Ability,
  type CharacterChoices,
  type ChoiceProblem,
  type SrdBackground,
} from '@ltw/contracts';

/**
 * A new character's ability scores (SRD 5.2.1, Character Creation step 3; docs/adr/0056-characters-
 * from-the-srd.md §2): the standard array, point buy, or the World Engine's rolls — 4d6 with the
 * lowest dropped, six times, the highest to the ability the player ranked first — then the
 * background's +2 and +1, or +1 to each of its three, never above 20.
 */
export type Scores = Record<Ability, number>;

/** Six scores from 24 d6: each four with the lowest dropped. */
export function rolledScores(d6: () => number): number[] {
  return Array.from({ length: 6 }, () => {
    const dice = [d6(), d6(), d6(), d6()].sort((a, b) => b - a);
    return (dice[0] ?? 0) + (dice[1] ?? 0) + (dice[2] ?? 0);
  });
}

export function baseScores(
  choices: CharacterChoices['abilities'],
  d6: () => number,
  problems: ChoiceProblem[],
): Scores {
  const problem = (message: string) => problems.push({ field: 'abilities', message });
  if (choices.method === 'rolled') {
    const priority = choices.priority ?? [];
    if (new Set(priority).size !== 6) problem('Rank the six abilities, each once');
    const rolled = rolledScores(d6).sort((a, b) => b - a);
    return Object.fromEntries(
      ABILITIES.map((ability) => [ability, rolled[priority.indexOf(ability)] ?? 8]),
    ) as Scores;
  }
  const base = choices.base;
  if (!base) {
    problem('Give the six scores');
    return Object.fromEntries(ABILITIES.map((ability) => [ability, 10])) as Scores;
  }
  const values = ABILITIES.map((ability) => base[ability]);
  if (choices.method === 'standard-array') {
    const sorted = [...values].sort((a, b) => b - a);
    if (sorted.join() !== STANDARD_ARRAY.join())
      problem('The standard array puts 15, 14, 13, 12, 10 and 8, each once');
  } else {
    const costs = values.map((value) => POINT_BUY_COST[value]);
    if (costs.some((cost) => cost === undefined)) problem('Point buy scores are 8 to 15');
    else if (costs.reduce((sum: number, cost) => sum + (cost ?? 0), 0) > POINT_BUY_BUDGET)
      problems.push({
        field: 'abilities',
        message: 'Point buy spends at most {budget} points',
        params: { budget: POINT_BUY_BUDGET },
      });
  }
  return { ...base };
}

/** The background's increases on the base scores. */
export function withIncreases(
  base: Scores,
  increases: CharacterChoices['increases'],
  background: SrdBackground,
  problems: ChoiceProblem[],
): Scores {
  const scores = { ...base };
  const allowed = new Set(background.abilityScores);
  const raise = (ability: Ability, by: number) => {
    if (!allowed.has(ability))
      problems.push({
        field: 'increases',
        message: '{background} raises only its three',
        params: { background: background.name },
      });
    scores[ability] = Math.min(20, scores[ability] + by);
  };
  if ('each' in increases) for (const ability of background.abilityScores) raise(ability, 1);
  else if (increases.plus2 === increases.plus1)
    problems.push({ field: 'increases', message: 'The +2 and the +1 go to two abilities' });
  else {
    raise(increases.plus2, 2);
    raise(increases.plus1, 1);
  }
  return scores;
}
