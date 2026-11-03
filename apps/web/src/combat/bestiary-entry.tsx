import type { BestiaryEntryResponse, SrdEntry } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useCallback, useRef, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { useScrollEdges } from '../visual/scroll-edges.ts';

/**
 * A stat block's whole SRD text, opened from the bestiary (docs/adr/0053-monsters-as-data.md §3):
 * its lines, traits, actions, bonus actions, reactions and legendary actions, in English as the
 * SRD gives them, read only when the DM opens it.
 */
export function BestiaryEntry({
  api,
  monsterId,
}: {
  readonly api: WorldApi;
  readonly monsterId: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <details
      className="bestiary-entry"
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary>{t('Its stat block')}</summary>
      {open && <EntryText api={api} monsterId={monsterId} />}
    </details>
  );
}

function EntryText({ api, monsterId }: { readonly api: WorldApi; readonly monsterId: string }) {
  const t = useT();
  const load = useCallback(
    (signal: AbortSignal) =>
      api.get<BestiaryEntryResponse>(`bestiary/${encodeURIComponent(monsterId)}`, signal, false),
    [api, monsterId],
  );
  const { resource, retry } = useResource(`bestiary:${monsterId}`, load);
  const box = useRef<HTMLDivElement>(null);
  const edges = useScrollEdges(box, `${monsterId}|${resource.status}`, 'y');
  if (resource.status !== 'ready')
    return (
      <StatusPanel
        state={resource.status === 'error' ? 'error' : 'loading'}
        label={resource.status === 'error' ? resource.message : t('Reading its stat block…')}
        onRetry={retry}
      />
    );
  const monster = resource.value.monster;
  return (
    // It scrolls: the keyboard reaches it too.
    <div
      ref={box}
      className="bestiary-text"
      role="region"
      aria-label={t('Its stat block')}
      tabIndex={0}
      data-more-before={edges.before ? '' : undefined}
      data-more-after={edges.after ? '' : undefined}
    >
      <p className="fine-print" lang={resource.value.language}>
        {`${monster.size} ${monster.type}, ${monster.alignment} · AC ${String(monster.armorClass)} · HP ${String(monster.hitPoints.average)} (${monster.hitPoints.dice}) · ${monster.speed}`}
      </p>
      <p className="fine-print" lang={resource.value.language}>
        {monster.senses}
      </p>
      <Section title={t('Traits')} entries={monster.traits} language={resource.value.language} />
      <Section title={t('Actions')} entries={monster.actions} language={resource.value.language} />
      <Section
        title={t('Bonus actions')}
        entries={monster.bonusActions}
        language={resource.value.language}
      />
      <Section
        title={t('Reactions')}
        entries={monster.reactions}
        language={resource.value.language}
      />
      <Section
        title={t('Legendary actions')}
        entries={monster.legendary?.entries ?? []}
        language={resource.value.language}
      />
    </div>
  );
}

function Section({
  title,
  entries,
  language,
}: {
  readonly title: string;
  readonly entries: readonly SrdEntry[];
  readonly language: 'en' | 'ru';
}) {
  if (entries.length === 0) return null;
  return (
    <section>
      <h6>{title}</h6>
      {entries.map((entry) => (
        <p key={entry.name} lang={language}>
          <strong>{entry.name}.</strong> {entry.text}
        </p>
      ))}
    </section>
  );
}
