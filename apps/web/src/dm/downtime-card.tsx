import { MAX_DOWNTIME_DAYS, type CraftingResponse } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useCallback, useId, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { Glyph } from '../visual/glyph.tsx';
import { useRereadOn } from '../world/use-world-data.ts';
import type { DmTableCommand } from './table-commands.ts';

/**
 * The DM's downtime (docs/adr/0057-encounters-maps-loot.md §9), on the Party sheet: the crafting
 * projects under way — who makes what, with whom, the days of work done and needed — and days of
 * work given to every one, or to one. A project done puts the made thing in its crafter's pack.
 */
export function DowntimeCard({
  api,
  revision,
  locked,
  onRun,
}: {
  readonly api: WorldApi;
  readonly revision: number;
  readonly locked: boolean;
  readonly onRun: (command: DmTableCommand) => void;
}) {
  const t = useT();
  const ids = useId();
  const [days, setDays] = useState(1);
  const load = useCallback(
    (signal: AbortSignal) => api.get<CraftingResponse>('crafting', signal),
    [api],
  );
  const { resource, reread, retry } = useResource('dm-crafting', load);
  useRereadOn(revision, reread);
  const projects = resource.status === 'ready' ? resource.value.projects : [];
  const work = (projectId?: string) => {
    onRun({ type: 'WorkDowntime', days, ...(projectId === undefined ? {} : { projectId }) });
  };
  return (
    <section className="sheet-section downtime" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>{t('Crafting and downtime')}</h3>
      {resource.status !== 'ready' ? (
        <StatusPanel
          state={resource.status === 'error' ? 'error' : 'loading'}
          label={resource.status === 'error' ? resource.message : t('Loading the crafting…')}
          onRetry={retry}
        />
      ) : projects.length === 0 ? (
        <p className="muted">{t('No one is crafting. A player begins a project from the pack.')}</p>
      ) : (
        <>
          <div className="account-field downtime-days">
            <label htmlFor={`${ids}-days`}>{t('Days of downtime')}</label>
            <input
              id={`${ids}-days`}
              type="number"
              min={1}
              max={MAX_DOWNTIME_DAYS}
              value={days}
              onChange={(event) => {
                const next = Math.round(Number(event.target.value));
                setDays(Math.min(MAX_DOWNTIME_DAYS, Math.max(1, next || 1)));
              }}
            />
          </div>
          <ul className="crafting-projects">
            {projects.map((project) => {
              const name =
                project.quantity > 1
                  ? t('{item}, {count}', { item: project.name, count: project.quantity })
                  : project.name;
              return (
                <li key={project.projectId} className="crafting-project">
                  <span className="crafting-name">{name}</span>
                  <span className="muted">
                    {[project.crafter, ...project.helpers].map((one) => one.name).join(', ')}
                  </span>
                  <progress
                    value={project.hoursDone}
                    max={project.hoursNeeded}
                    aria-label={t('{item}: work done', { item: name })}
                  />
                  <span className="crafting-done">
                    {t('Days of work: {done} of {needed}', {
                      done: project.hoursDone / 8,
                      needed: project.hoursNeeded / 8,
                    })}
                  </span>
                  <button
                    type="button"
                    disabled={locked}
                    aria-label={t('Give the days to {item} only', { item: name })}
                    onClick={() => {
                      work(project.projectId);
                    }}
                  >
                    {t('Give the days')}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="action-row">
            <button
              type="button"
              className="primary-button"
              disabled={locked}
              onClick={() => {
                work();
              }}
            >
              <Glyph name="time" />
              {t('Give the days to every project')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
