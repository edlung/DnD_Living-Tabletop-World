import type { RulesIndexResponse } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useId, useRef, useState, type KeyboardEvent } from 'react';

import { Sheet } from '../shell/sheet.tsx';
import type { Shell } from '../shell/use-shell.ts';
import { useReference, useRulesApi } from './reference-data.ts';
import { RulesGlossary } from './rules-glossary.tsx';
import { RulesToolbox } from './rules-toolbox.tsx';

type Part = 'glossary' | 'toolbox';
const PARTS: readonly { readonly id: Part; readonly label: string }[] = [
  { id: 'glossary', label: 'Glossary' },
  { id: 'toolbox', label: 'Toolbox' },
];

/**
 * The Rules sheet (docs/adr/0055-rules-reference-and-toolbox.md §2): the SRD's Rules Glossary for
 * everyone at the table, found by name or by its tag; for the DM the Gameplay Toolbox and the
 * magic items' rules too. It reads the reference only once it is first opened; read only.
 */
export function RulesSheet({ shell, isDm }: { readonly shell: Shell; readonly isDm: boolean }) {
  const t = useT();
  const open = shell.sheet === 'rules';
  const [seen, setSeen] = useState(false);
  if (open && !seen) setSeen(true);
  return (
    <Sheet id="rules" title={t('Rules')} glyph="study" open={open} onClose={shell.closeSheet}>
      {seen && <RulesBody isDm={isDm} />}
    </Sheet>
  );
}

function RulesBody({ isDm }: { readonly isDm: boolean }) {
  const t = useT();
  const api = useRulesApi();
  const ids = useId();
  const { resource, retry } = useReference<RulesIndexResponse>(api, 'rules');
  const [part, setPart] = useState<Part>('glossary');
  const tabs = useRef(new Map<Part, HTMLButtonElement>());
  if (resource.status !== 'ready')
    return (
      <StatusPanel
        state={resource.status === 'error' ? 'error' : 'loading'}
        label={resource.status === 'error' ? t(resource.message) : t('Reading the rules…')}
        onRetry={retry}
      />
    );
  const index = resource.value;
  const sections = isDm ? index.sections : null;
  const move = (event: KeyboardEvent) => {
    const next: Part | null =
      event.key === 'ArrowRight' || event.key === 'ArrowLeft'
        ? part === 'glossary'
          ? 'toolbox'
          : 'glossary'
        : event.key === 'Home'
          ? 'glossary'
          : event.key === 'End'
            ? 'toolbox'
            : null;
    if (next === null) return;
    event.preventDefault();
    setPart(next);
    tabs.current.get(next)?.focus();
  };
  return (
    <div className="rules-reference">
      {sections && (
        <div className="rules-parts" role="tablist" aria-label={t('Rules')} onKeyDown={move}>
          {PARTS.map((entry) => (
            <button
              key={entry.id}
              ref={(element) => {
                if (element) tabs.current.set(entry.id, element);
              }}
              type="button"
              role="tab"
              id={`${ids}-${entry.id}`}
              aria-selected={part === entry.id}
              aria-controls={`${ids}-panel`}
              tabIndex={part === entry.id ? 0 : -1}
              onClick={() => {
                setPart(entry.id);
              }}
            >
              {t(entry.label)}
            </button>
          ))}
        </div>
      )}
      <div
        id={`${ids}-panel`}
        className="rules-part"
        {...(sections ? { role: 'tabpanel', 'aria-labelledby': `${ids}-${part}` } : {})}
      >
        {sections && part === 'toolbox' ? (
          <RulesToolbox sections={sections} />
        ) : (
          <RulesGlossary index={index} />
        )}
      </div>
    </div>
  );
}
