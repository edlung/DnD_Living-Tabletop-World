import type { EncounterView, EntityKind, EntityRef, KnowledgeView } from '@ltw/contracts';
import { EncounterSummary, useT } from '@ltw/ui';

import type { WorldApi } from '../api/client.ts';
import { Sheet } from '../shell/sheet.tsx';
import type { Shell } from '../shell/use-shell.ts';
import { Glyph } from '../visual/glyph.tsx';
import { kindGlyph } from '../visual/glyph-map.ts';
import { KnowledgeCards } from '../visual/knowledge-cards.tsx';
import { distinctNames } from './entity-words.ts';
import { JournalQuests } from './journal-quests.tsx';
import { RecentEvents } from './recent-events.tsx';

export interface JournalData {
  readonly directory: readonly EntityRef[];
  readonly knowledge: readonly KnowledgeView[];
  readonly encounter: EncounterView | null;
}

/**
 * The Journal sheet (docs/STAGE_320_DESIGN.md §5.4): the party's quests (Stage 530), who and what
 * this perspective knows, its hypotheses, and the events it remembers, each reachable in full (invariant 19). Presence is
 * the scene's to show. The encounter's summary, in words, is here too: whether one runs, its
 * turn order and an open reaction window, as this perspective may see them.
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
  const names = distinctNames(t, journal?.directory ?? [], { kindShown: true });
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
          <JournalQuests api={api} revision={revision} />
          <section className="sheet-section" aria-labelledby="journal-known">
            <h3 id="journal-known">{t('Known people & places')}</h3>
            <p className="muted">
              {t('What this perspective knows. Presence is shown separately in the scene.')}
            </p>
            <ul className="directory-list">
              {journal.directory.map((entity) => (
                <li key={entity.entityId}>
                  <button
                    type="button"
                    className="list-button"
                    aria-pressed={selectedId === entity.entityId}
                    onClick={() => {
                      onSelect(entity.entityId, entity.kind);
                    }}
                  >
                    <Glyph name={kindGlyph(entity.kind)} />
                    <span className="directory-name">
                      {names.get(entity.entityId) ?? entity.name}
                    </span>
                    <span className="directory-kind">{t(entity.kind)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {journal.directory.length === 0 && <p>{t('No entities are known yet.')}</p>}
          </section>
          <section className="sheet-section" aria-labelledby="journal-hypotheses">
            <h3 id="journal-hypotheses">{t('Hypotheses')}</h3>
            {hypotheses.length > 0 ? (
              <KnowledgeCards knowledge={hypotheses} />
            ) : (
              <p className="muted">{t('No hypothesis is recorded in this perspective yet.')}</p>
            )}
          </section>
          <RecentEvents key={revision} api={api} />
          <EncounterSummary encounter={journal.encounter} />
        </div>
      )}
    </Sheet>
  );
}
