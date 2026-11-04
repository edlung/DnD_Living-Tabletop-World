import type { CraftingResponse, CraftProjectView } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useCallback, useId, useState } from 'react';

import type { WorldApi } from '../../api/client.ts';
import { useResource } from '../../api/resource.ts';
import { useRereadOn } from '../../world/use-world-data.ts';
import type { ItemCommandBody } from '../item-command.ts';
import { CraftStart } from './craft-start.tsx';

/** Hours of work as days: eight hours a day (SRD 5.2.1). */
const days = (hours: number) => hours / 8;

/**
 * Crafting in the pack (docs/adr/0057-encounters-maps-loot.md §9): the projects the character
 * works on, with the days of work done and needed and a way to give its own up, and, while it is
 * on none, a way to begin one. The DM gives the days of work; the World Engine decides the rest.
 */
export function CraftingSection({
  api,
  revision,
  characterId,
  blocked,
  onRun,
}: {
  readonly api: WorldApi;
  readonly revision: number;
  readonly characterId: string;
  readonly blocked: boolean;
  readonly onRun: (body: ItemCommandBody) => void;
}) {
  const t = useT();
  const ids = useId();
  const load = useCallback(
    (signal: AbortSignal) => api.get<CraftingResponse>('crafting', signal),
    [api],
  );
  const { resource, reread, retry } = useResource('crafting', load);
  useRereadOn(revision, reread);
  if (resource.status !== 'ready')
    return (
      <StatusPanel
        state={resource.status === 'error' ? 'error' : 'loading'}
        label={resource.status === 'error' ? resource.message : t('Loading the crafting…')}
        onRetry={retry}
      />
    );
  const crafting = resource.value;
  return (
    <section className="crafting" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>{t('Crafting')}</h3>
      {crafting.projects.length > 0 && (
        <ul className="crafting-projects">
          {crafting.projects.map((project) => (
            <ProjectRow
              key={project.projectId}
              project={project}
              own={project.crafter.entityId === characterId}
              blocked={blocked}
              onAbandon={() => {
                onRun({ type: 'AbandonCrafting', projectId: project.projectId });
              }}
            />
          ))}
        </ul>
      )}
      {crafting.busy ? (
        <p className="muted">{t('The DM gives the days of work as time passes.')}</p>
      ) : (
        <CraftStart crafting={crafting} blocked={blocked} onRun={onRun} />
      )}
    </section>
  );
}

function ProjectRow({
  project,
  own,
  blocked,
  onAbandon,
}: {
  readonly project: CraftProjectView;
  readonly own: boolean;
  readonly blocked: boolean;
  readonly onAbandon: () => void;
}) {
  const t = useT();
  const ids = useId();
  const [asking, setAsking] = useState(false);
  const name =
    project.quantity > 1
      ? t('{item}, {count}', { item: project.name, count: project.quantity })
      : project.name;
  return (
    <li className="crafting-project">
      <span className="crafting-name" id={`${ids}-name`}>
        {name}
      </span>
      {project.helpers.length > 0 && (
        <span className="muted">
          {t('Helped by {names}', { names: project.helpers.map((one) => one.name).join(', ') })}
        </span>
      )}
      <progress
        value={project.hoursDone}
        max={project.hoursNeeded}
        aria-labelledby={`${ids}-name`}
        aria-describedby={`${ids}-done`}
      />
      <span id={`${ids}-done`} className="crafting-done">
        {t('Days of work: {done} of {needed}', {
          done: days(project.hoursDone),
          needed: days(project.hoursNeeded),
        })}
      </span>
      {own &&
        (asking ? (
          <span className="crafting-ask" role="group" aria-label={t('Give the work up?')}>
            <span>{t('Give up {item}? Its materials are spent.', { item: name })}</span>
            <button
              type="button"
              disabled={blocked}
              onClick={() => {
                setAsking(false);
                onAbandon();
              }}
            >
              {t('Give it up')}
            </button>
            <button
              type="button"
              onClick={() => {
                setAsking(false);
              }}
            >
              {t('Keep at it')}
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="crafting-quit"
            disabled={blocked}
            aria-label={t('Give up {item}', { item: name })}
            onClick={() => {
              setAsking(true);
            }}
          >
            {t('Give up')}
          </button>
        ))}
    </li>
  );
}
