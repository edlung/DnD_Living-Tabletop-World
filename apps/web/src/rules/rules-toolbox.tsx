import type { RulesIndexSection, RulesSectionResponse } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useEffect, useRef, useState } from 'react';

import { useScrollEdges } from '../visual/scroll-edges.ts';
import { useReference, useRulesApi } from './reference-data.ts';
import { SrdBlocks } from './srd-blocks.tsx';

/**
 * The DM's part of the reference (docs/adr/0055-rules-reference-and-toolbox.md §2): the Gameplay
 * Toolbox and the magic items' rules, by chapter and section; a section reads with the sections
 * under it ("Traps": its parts, then each example trap).
 */
export function RulesToolbox({ sections }: { readonly sections: readonly RulesIndexSection[] }) {
  const t = useT();
  const [chosen, setChosen] = useState<string | null>(null);
  const toc = useRef<HTMLDivElement>(null);
  const edges = useScrollEdges(toc, `${String(sections.length)}|${chosen ?? ''}`, 'y');
  const chapters = sections.filter((section) => section.level === 1);
  const back = () => {
    const was = chosen;
    setChosen(null);
    requestAnimationFrame(() => {
      toc.current?.querySelector<HTMLElement>(`[data-section="${was ?? ''}"]`)?.focus();
    });
  };
  return (
    <div className={`rules-toolbox${chosen ? ' has-entry' : ''}`}>
      <div
        ref={toc}
        className="rules-index"
        data-more-before={edges.before || undefined}
        data-more-after={edges.after || undefined}
      >
        {chapters.map((chapter) => {
          const at = sections.indexOf(chapter);
          const end = sections.findIndex((one, index) => index > at && one.level === 1);
          const inside = sections
            .slice(at + 1, end < 0 ? undefined : end)
            .filter((one) => one.level === 2);
          return (
            <section key={chapter.sectionId} aria-labelledby={`toc-${chapter.sectionId}`}>
              <h3 id={`toc-${chapter.sectionId}`} className="rules-chapter">
                {chapter.title}
              </h3>
              <ul className="rules-list">
                {[chapter, ...inside].map((section) => (
                  <li key={section.sectionId}>
                    <button
                      type="button"
                      className="list-button"
                      data-section={section.sectionId}
                      aria-current={chosen === section.sectionId ? 'true' : undefined}
                      onClick={() => {
                        setChosen(section.sectionId);
                      }}
                    >
                      <span className="directory-name">
                        {section === chapter ? t('About this chapter') : section.title}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {chosen ? (
        <ToolboxSection sectionId={chosen} onBack={back} />
      ) : (
        <p className="rules-pick muted">{t('Pick a section to read it.')}</p>
      )}
    </div>
  );
}

function ToolboxSection({
  sectionId,
  onBack,
}: {
  readonly sectionId: string;
  readonly onBack: () => void;
}) {
  const t = useT();
  const api = useRulesApi();
  const { resource, retry } = useReference<RulesSectionResponse>(
    api,
    `rules/sections/${encodeURIComponent(sectionId)}`,
  );
  const heading = useRef<HTMLHeadingElement>(null);
  const pane = useRef<HTMLElement>(null);
  const ready = resource.status === 'ready';
  const edges = useScrollEdges(pane, `${sectionId}|${resource.status}`, 'y');
  useEffect(() => {
    if (ready) heading.current?.focus();
  }, [ready, sectionId]);
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
        {t('All sections')}
      </button>
      {resource.status !== 'ready' ? (
        <StatusPanel
          state={resource.status === 'error' ? 'error' : 'loading'}
          label={resource.status === 'error' ? t(resource.message) : t('Reading the rules…')}
          onRetry={retry}
        />
      ) : (
        resource.value.sections.map((section, index) => {
          const Heading = index === 0 ? 'h3' : section.level <= 3 ? 'h4' : 'h5';
          return (
            <section
              key={section.sectionId}
              className="rules-section"
              lang={resource.value.language}
            >
              <Heading
                ref={index === 0 ? heading : undefined}
                tabIndex={index === 0 ? -1 : undefined}
              >
                {section.title}
              </Heading>
              {section.subtitle && <p className="rules-subtitle">{section.subtitle}</p>}
              <SrdBlocks blocks={section.blocks} language={resource.value.language} />
            </section>
          );
        })
      )}
    </article>
  );
}
