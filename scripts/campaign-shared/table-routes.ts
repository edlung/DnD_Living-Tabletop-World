import { existsSync, readFileSync } from 'node:fs';

interface Followup {
  location: string;
  choice: string;
}
interface Route {
  choice: string;
  ending: string;
  followup: Followup;
}
interface Routes {
  refusal: Route;
  discovery: Route & { inference: string; clues: string[]; chapter: number };
  defeat: { cost: string; ending: string; followup: Followup; chapter: number; encounter: string };
}

/** Spoilers for the GM's book and owner preparation. Never add these paragraphs to character knowledge. */
export function tableRoutes(root: URL) {
  const file = new URL('source/table-routes.json', root);
  if (!existsSync(file)) return [];
  const data = JSON.parse(readFileSync(file, 'utf8')) as Routes;
  const clues = JSON.parse(readFileSync(new URL('source/clues.json', root), 'utf8')) as {
    key: string;
    name: string;
  }[];
  const proof = data.discovery.clues.map((key) => {
    const clue = clues.find((c) => c.key === key);
    if (!clue) throw Error('Unknown table clue ' + key + ' in ' + root.pathname);
    return clue.name;
  });
  return [
    {
      chapter: 1,
      name: 'Группа отказалась от задания',
      steps: [data.refusal.choice, data.refusal.followup.choice, data.refusal.ending],
    },
    {
      chapter: data.discovery.chapter,
      name: 'Игроки раскрыли тайну раньше',
      steps: [
        data.discovery.choice,
        'Доступные свидетельства — ' + proof.join(', ') + '.',
        data.discovery.inference,
        data.discovery.followup.choice,
        data.discovery.ending,
      ],
    },
    {
      chapter: data.defeat.chapter,
      name: 'Партия уступила поле',
      steps: [data.defeat.cost, data.defeat.followup.choice, data.defeat.ending],
    },
  ];
}
