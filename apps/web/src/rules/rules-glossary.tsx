import type { RulesEntryResponse, RulesIndexResponse, SrdGlossaryTag } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useEffect, useRef, useState } from 'react';

import { Field } from '../session/account-forms.tsx';
import { useScrollEdges } from '../visual/scroll-edges.ts';
import { useReference, useRulesApi } from './reference-data.ts';
import { SrdBlocks } from './srd-blocks.tsx';

const TAGS: readonly { readonly tag: SrdGlossaryTag | null; readonly label: string }[] = [
  { tag: null, label: 'All' },
  { tag: 'Condition', label: 'Conditions' },
  { tag: 'Action', label: 'Actions' },
  { tag: 'Area of Effect', label: 'Areas of effect' },
  { tag: 'Hazard', label: 'Hazards' },
  { tag: 'Attitude', label: 'Attitudes' },
];
export const TAG_WORDS: Readonly<Record<SrdGlossaryTag, string>> = {
  Action: 'Action',
  'Area of Effect': 'Area of effect',
  Attitude: 'Attitude',
  Condition: 'Condition',
  Hazard: 'Hazard',
};

/**
 * The glossary (docs/adr/0055-rules-reference-and-toolbox.md §2): its entries found by name or by
 * tag, an entry read beside the list (on a phone in its place, with the way back), the entries it
 * names one tap away, and the abbreviations.
 */
export function RulesGlossary({ index }: { readonly index: RulesIndexResponse }) {
  const t = useT();
  const [words, setWords] = useState('');
  const [tag, setTag] = useState<SrdGlossaryTag | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const query = words.trim().toLowerCase();
  const shown = index.entries.filter(
    (entry) =>
      (tag === null || entry.tag === tag) &&
      (query === '' || entry.name.toLowerCase().includes(query)),
  );
  const edges = useScrollEdges(pane, `${String(shown.length)}|${tag ?? ''}|${chosen ?? ''}`, 'y');
  const byName = new Map(index.entries.map((entry) => [entry.name.toLowerCase(), entry.entryId]));
  const back = () => {
    const was = chosen;
    setChosen(null);
    // Back to the entry it was read from in the list.
    requestAnimationFrame(() => {
      list.current?.querySelector<HTMLElement>(`[data-entry="${was ?? ''}"]`)?.focus();
    });
  };
  return (
    <div className={`rules-glossary${chosen ? ' has-entry' : ''}`}>
      <div
        ref={pane}
        className="rules-index"
        data-more-before={edges.before || undefined}
        data-more-after={edges.after || undefined}
      >
        <Field label={t('Find a rule')}>
          {(control) => (
            <input
              {...control}
              type="search"
              value={words}
              onChange={(event) => {
                setWords(event.target.value);
              }}
            />
          )}
        </Field>
        <div className="rules-tags" role="group" aria-label={t('Show')}>
          {TAGS.map((entry) => (
            <button
              key={entry.label}
              type="button"
              aria-pressed={tag === entry.tag}
              onClick={() => {
                setTag(entry.tag);
              }}
            >
              {t(entry.label)}
            </button>
          ))}
        </div>
        <p className="visually-hidden" role="status">
          {t('Rules shown: {count}', { count: shown.length })}
        </p>
        <ul ref={list} className="rules-list">
          {shown.map((entry) => (
            <li key={entry.entryId}>
              <button
                type="button"
                className="list-button"
                data-entry={entry.entryId}
                aria-current={chosen === entry.entryId ? 'true' : undefined}
                onClick={() => {
                  setChosen(entry.entryId);
                }}
              >
                <span className="directory-name" lang={index.language}>
                  {entry.name}
                </span>
                {entry.tag && <span className="directory-kind">{t(TAG_WORDS[entry.tag])}</span>}
              </button>
            </li>
          ))}
        </ul>
        {shown.length === 0 && <p className="muted">{t('No rule matches.')}</p>}
        <details className="rules-abbreviations">
          <summary>{t('Abbreviations')}</summary>
          <dl lang={index.language}>
            {index.abbreviations.map((entry) => (
              <div key={entry.abbreviation}>
                <dt>{entry.abbreviation}</dt>
                <dd>{entry.meaning}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
      {chosen ? (
        <GlossaryEntry
          entryId={chosen}
          index={index}
          entryOf={(name) => byName.get(name.toLowerCase()) ?? null}
          onEntry={setChosen}
          onBack={back}
        />
      ) : (
        <p className="rules-pick muted">{t('Pick a rule to read what it says.')}</p>
      )}
    </div>
  );
}

function GlossaryEntry({
  entryId,
  index,
  entryOf,
  onEntry,
  onBack,
}: {
  readonly entryId: string;
  readonly index: RulesIndexResponse;
  readonly entryOf: (name: string) => string | null;
  readonly onEntry: (entryId: string) => void;
  readonly onBack: () => void;
}) {
  const t = useT();
  const api = useRulesApi();
  const { resource, retry } = useReference<RulesEntryResponse>(
    api,
    `rules/glossary/${encodeURIComponent(entryId)}`,
  );
  const heading = useRef<HTMLHeadingElement>(null);
  const pane = useRef<HTMLElement>(null);
  const ready = resource.status === 'ready';
  const edges = useScrollEdges(pane, `${entryId}|${resource.status}`, 'y');
  // A chosen entry takes focus, so its words are read next.
  useEffect(() => {
    if (ready) heading.current?.focus({ preventScroll: false });
  }, [ready, entryId]);
  const names = new Map(index.entries.map((entry) => [entry.entryId, entry.name]));
  return (
    // It scrolls on its own: the keyboard reaches it too.
    <article
      ref={pane}
      tabIndex={0}
      aria-label={t('What the rules say')}
      className="rules-entry"
      data-more-before={edges.before || undefined}
      data-more-after={edges.after || undefined}
    >
      <button type="button" className="rules-back" onClick={onBack}>
        {t('All rules')}
      </button>
      {resource.status !== 'ready' ? (
        <StatusPanel
          state={resource.status === 'error' ? 'error' : 'loading'}
          label={resource.status === 'error' ? t(resource.message) : t('Reading the rules…')}
          onRetry={retry}
        />
      ) : (
        <>
          <h3 ref={heading} tabIndex={-1} lang={resource.value.language}>
            {resource.value.entry.name}
            {resource.value.entry.tag && (
              <span className="rules-tag">{t(TAG_WORDS[resource.value.entry.tag])}</span>
            )}
          </h3>
          <SrdBlocks
            blocks={resource.value.entry.blocks}
            language={resource.value.language}
            entryOf={entryOf}
            onEntry={onEntry}
          />
          {resource.value.entry.seeAlso.length > 0 && (
            <nav className="rules-see-also" aria-label={t('See also')}>
              <h4>{t('See also')}</h4>
              <ul>
                {resource.value.entry.seeAlso.map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      className="srd-link"
                      lang={index.language}
                      onClick={() => {
                        onEntry(id);
                      }}
                    >
                      {names.get(id) ?? id}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </>
      )}
    </article>
  );
}
