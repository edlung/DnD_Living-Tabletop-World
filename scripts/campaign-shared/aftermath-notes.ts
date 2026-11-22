import type { CampaignKnowledge } from '../../packages/contracts/src/index.ts';

interface Evening {
  key: string;
  scenes: readonly { title: string; failForward: string; dmAftermath?: boolean }[];
}

/** The offline book and the activated DM's notes use the same loss ruling. */
export function aftermathNotes(evenings: readonly Evening[]): CampaignKnowledge[] {
  return evenings.flatMap((evening) =>
    evening.scenes.flatMap((scene, i): CampaignKnowledge[] =>
      scene.dmAftermath
        ? [
            {
              key: `${evening.key}-scene-${i + 1}-aftermath`,
              scope: { kind: 'DM' },
              knowledgeType: 'FACT',
              statement: `${scene.title}. ${scene.failForward}`,
              subjects: [],
              relations: [],
              knownSince: null,
            },
          ]
        : [],
    ),
  );
}
