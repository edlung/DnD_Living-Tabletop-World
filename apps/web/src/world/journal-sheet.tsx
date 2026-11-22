import type { EncounterView, EntityKind, EntityRef, KnowledgeView } from '@ltw/contracts';
import { EncounterSummary, useT } from '@ltw/ui';

import type { WorldApi } from '../api/client.ts';
import { HandoutsSection } from '../handouts/handouts.tsx';
import { SealedEnvelopes } from '../handouts/sealed-envelopes.tsx';
import { Sheet } from '../shell/sheet.tsx';
import type { Shell } from '../shell/use-shell.ts';
import { KnowledgeCards } from '../visual/knowledge-cards.tsx';
import { JournalKnown } from './journal-known.tsx';
import { JournalQuests } from './journal-quests.tsx';
import { RecentEvents } from './recent-events.tsx';

export interface JournalData {
  readonly directory: readonly EntityRef[];
  readonly knowledge: readonly KnowledgeView[];
  readonly encounter: EncounterView | null;
}

/**
 * The Journal sheet (docs/STAGE_320_DESIGN.md §5.4), three panes side by side on a wide screen:
 * the party's quests (Stage 530), what waits for it and its hypotheses; the events it remembers;
 * who and what this perspective knows — each reachable in full (invariant 19). Presence is the
 * scene's to show. The encounter's summary, in words, is here too: whether one runs, its turn
 * order and an open reaction window, as this perspective may see them.
 */
export function JournalSheet({
  api,
  shell,
  revision,
  journal,
  selectedId,
  onSelect,
}: {
  readonly api: WorldApi;
  readonly shell: Shell;
  readonly revision: number;
  /** Null until the world has loaded. */
  readonly journal: JournalData | null;
  readonly selectedId: string | null;
  readonly onSelect: (entityId: string, kind: EntityKind) => void;
}) {
  const t = useT();
  const hypotheses =
    journal?.knowledge.filter((record) => record.knowledgeType === 'HYPOTHESIS') ?? [];
  return (
    <Sheet
      id="journal"
      title={t('Journal')}
      glyph="journal"
      open={shell.sheet === 'journal'}
      onClose={shell.closeSheet}
    >
      {journal && (
        <div className="journal">
          {/* What the party is about: its quests, what waits for it, what it supposes. */}
          <div className="journal-pane journal-pane--story">
            <JournalQuests api={api} revision={revision} />
            {/* What waits for the party, sealed (docs/adr/0073-table-ideas.md §9). */}
            <SealedEnvelopes api={api} />
            <HandoutsSection api={api} />
            <section className="sheet-section" aria-labelledby="journal-hypotheses">
              <h3 id="journal-hypotheses">{t('Hypotheses')}</h3>
              {hypotheses.length > 0 ? (
                <KnowledgeCards knowledge={hypotheses} />
              ) : (
                <p className="muted">{t('No hypothesis is recorded in this perspective yet.')}</p>
              )}
            </section>
            <EncounterSummary encounter={journal.encounter} />
          </div>
          <div className="journal-pane journal-pane--events">
            <RecentEvents key={revision} api={api} />
          </div>
          <div className="journal-pane journal-pane--known">
            <JournalKnown
              directory={journal.directory}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          </div>
        </div>
      )}
    </Sheet>
  );
}
