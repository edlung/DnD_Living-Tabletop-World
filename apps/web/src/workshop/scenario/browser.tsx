import type { CampaignAssessment, CampaignPackage } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useMemo, useRef } from 'react';

import type { ScenarioSave } from './edit-fields.tsx';
import { FINDING_LABELS } from './findings.ts';
import { buildScenarioIndex, nearestScenarioPath, GROUP_LABELS } from './graph.ts';
import { ScenarioInspector } from './inspector.tsx';
import { ScenarioOverview } from './overview.tsx';

export interface ScenarioBrowserProps {
  readonly content: CampaignPackage;
  readonly assessment: CampaignAssessment | null;
  readonly selectedPath: string | null;
  readonly onSelect: (path: string) => void;
  readonly onSave?: ScenarioSave;
}

export function ScenarioBrowser({
  content,
  assessment,
  selectedPath,
  onSelect,
  onSave,
}: ScenarioBrowserProps) {
  const t = useT();
  const inspector = useRef<HTMLDivElement>(null);
  const selectedByUser = useRef(false);
  const index = useMemo(() => buildScenarioIndex(content), [content]);
  const path = nearestScenarioPath(index, selectedPath);
  useEffect(() => {
    if (!selectedByUser.current) return;
    selectedByUser.current = false;
    inspector.current?.focus({ preventScroll: true });
    if (window.matchMedia('(max-width: 1099px)').matches)
      inspector.current?.scrollIntoView({ block: 'start' });
  }, [path]);
  const select = (next: string) => {
    if (next === path) {
      inspector.current?.focus({ preventScroll: true });
      if (window.matchMedia('(max-width: 1099px)').matches)
        inspector.current?.scrollIntoView({ block: 'start' });
    }
    selectedByUser.current = next !== path;
    onSelect(next);
  };
  const node = index.byPath.get(path);
  if (!node) return null;
  return (
    <section className="scenario-browser" aria-label={t('Campaign scenario')}>
      <p className="scenario-guidance">
        {t(
          'Follow the opening into situations and clues, then inspect the people, their knowledge and the truth behind it.',
        )}
      </p>
      {assessment ? (
        <details className="scenario-findings" open={assessment.findings.length > 0}>
          <summary>
            {t('Preparation checks')} ·{' '}
            {assessment.readiness === 'READY'
              ? t('Ready for review')
              : assessment.readiness === 'INVALID'
                ? t('Corrections needed')
                : t('Preparation incomplete')}{' '}
            · {assessment.findings.length}
          </summary>
          {assessment.findings.length === 0 ? (
            <p>{t('No preparation findings.')}</p>
          ) : (
            <ul>
              {assessment.findings.map((finding, ordinal) => {
                const target = index.byPath.get(nearestScenarioPath(index, finding.path));
                return (
                  <li key={ordinal}>
                    <span>
                      {finding.severity === 'error'
                        ? t('Error')
                        : finding.severity === 'warning'
                          ? t('Warning')
                          : t('Note')}
                    </span>
                    <button
                      type="button"
                      className="scenario-reference"
                      onClick={() => {
                        select(target?.path ?? 'world');
                      }}
                    >
                      {target
                        ? [
                            'world',
                            'brief',
                            'party',
                            'relationships',
                            'possessions',
                            'firstSession',
                            'laterOutline',
                          ].includes(target.group)
                          ? t(GROUP_LABELS[target.group])
                          : target.title
                        : t('Opening')}
                    </button>
                    <p>
                      {t(
                        FINDING_LABELS[finding.code] ??
                          'Review the linked object and its references.',
                      )}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </details>
      ) : (
        <p className="scenario-muted">
          {t('AI proposal. Preparation checks will run when it becomes a revision.')}
        </p>
      )}
      <div className="scenario-layout">
        <ScenarioOverview index={index} selectedPath={path} onSelect={select} />
        <div ref={inspector} tabIndex={-1} className="scenario-inspector-target">
          <ScenarioInspector
            content={content}
            node={node}
            index={index}
            onSelect={select}
            {...(onSave ? { onSave } : {})}
          />
        </div>
      </div>
      <p className="scenario-muted">
        {t('Package format {version}', { version: content.schemaVersion })}
      </p>
    </section>
  );
}
