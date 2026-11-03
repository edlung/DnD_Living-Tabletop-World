import type { RulesEntryResponse } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useId, useState, type ReactNode } from 'react';

import { useReference, useRulesApi } from './reference-data.ts';
import { SrdBlocks } from './srd-blocks.tsx';

/**
 * A rules term where it is used (docs/adr/0055-rules-reference-and-toolbox.md §3): a condition's
 * chip, an action's title. A tap or a click opens the glossary's entry beside it — never hover
 * alone — read when first opened; Escape or a click elsewhere closes it, and focus goes back to
 * the term. Outside a campaign's world the term is its words alone.
 */
export function RuleTerm({
  entryId,
  children,
}: {
  readonly entryId: string;
  readonly children: ReactNode;
}) {
  const t = useT();
  const api = useRulesApi();
  const id = useId();
  const [opened, setOpened] = useState(false);
  if (!api) return children;
  const popover = `${id}-rule`;
  return (
    <>
      <button
        type="button"
        className="rule-term"
        popoverTarget={popover}
        aria-describedby={`${id}-hint`}
      >
        {children}
      </button>
      <span id={`${id}-hint`} className="visually-hidden">
        {t('Opens what the rules say')}
      </span>
      <div
        id={popover}
        popover="auto"
        className="rule-popover"
        role="dialog"
        aria-labelledby={`${id}-title`}
        onToggle={(event) => {
          if (event.newState === 'open') setOpened(true);
        }}
      >
        {opened ? (
          <RuleEntry entryId={entryId} titleId={`${id}-title`} />
        ) : (
          <span id={`${id}-title`} className="visually-hidden">
            {t('What the rules say')}
          </span>
        )}
      </div>
    </>
  );
}

function RuleEntry({ entryId, titleId }: { readonly entryId: string; readonly titleId: string }) {
  const t = useT();
  const api = useRulesApi();
  const { resource, retry } = useReference<RulesEntryResponse>(
    api,
    `rules/glossary/${encodeURIComponent(entryId)}`,
  );
  if (resource.status !== 'ready')
    return (
      <>
        <h3 id={titleId} className="visually-hidden">
          {t('What the rules say')}
        </h3>
        <StatusPanel
          state={resource.status === 'error' ? 'error' : 'loading'}
          label={resource.status === 'error' ? t(resource.message) : t('Reading the rules…')}
          onRetry={retry}
        />
      </>
    );
  const { entry, language } = resource.value;
  return (
    <>
      <h3 id={titleId} className="rule-popover-title" lang={language}>
        {entry.name}
      </h3>
      <SrdBlocks blocks={entry.blocks} language={language} />
      <p className="fine-print">{t('From the SRD 5.2.1 rules glossary.')}</p>
    </>
  );
}
