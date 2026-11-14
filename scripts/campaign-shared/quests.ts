import type { CampaignPackage } from '../../packages/contracts/src/index.ts';

interface QuestSource {
  sessions: readonly {
    title: string;
    goal: string;
    location: string;
    clues: readonly string[];
  }[];
  clues: readonly { key: string; location: string; subjects: readonly string[] }[];
}

/**
 * The party's journal over the whole campaign: one entry per chapter. A chapter opens when the
 * party learns something about its first clue's subject, so it cannot fail to appear, and it is
 * closed by moving on to the next chapter's place, not by the first look around.
 */
export function buildQuests(s: QuestSource): CampaignPackage['quests'] {
  const clues = new Map(s.clues.map((clue) => [clue.key, clue]));
  return s.sessions.flatMap((session, index) => {
    const clue = session.clues.map((key) => clues.get(key)).find((x) => x !== undefined);
    const subject = clue?.subjects[0];
    if (!clue || subject === undefined) return [];
    const next = s.sessions[index + 1]?.location;
    const movesOn = next !== undefined && next !== clue.location;
    return [
      {
        questId: `chapter-${index + 1}`,
        title: session.title,
        activation: { subject, summary: session.goal },
        milestones: [
          {
            kind: 'examined-at' as const,
            stage: 'observed',
            locationId: clue.location,
            summary: 'Появилась первая зацепка этой главы.',
          },
          ...(movesOn
            ? [
                {
                  kind: 'returned-to' as const,
                  stage: 'moved-on',
                  locationId: next,
                  after: 'observed',
                  summary: 'Группа двинулась дальше: открывается следующая глава.',
                },
              ]
            : []),
        ],
        completion: movesOn ? 'moved-on' : 'observed',
      },
    ];
  });
}
