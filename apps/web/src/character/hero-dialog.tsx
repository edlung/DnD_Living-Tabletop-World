import type {
  CharacterDerived,
  CharacterSheet,
  CharacterSheetResponse,
  EntityKind,
} from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { ApiError, type WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import type { HeroTab } from '../shell/use-shell.ts';
import { IconButton } from '../visual/icon-button.tsx';
import { usePortrait } from '../world/use-portrait.ts';
import { useRereadOn } from '../world/use-world-data.ts';
import { CharacterCard } from './character-card.tsx';
import { OverviewTab } from './overview-tab.tsx';
import { PrintSection } from './print-sheet.tsx';
import { SkillsTab } from './skills-tab.tsx';
import { SpellsTab } from './spells-tab.tsx';

/** Sections the world adds to the Overview tab for the sheet shown. */
export type OverviewSections = (shown: {
  readonly entityId: string;
  readonly sheet: CharacterSheet;
  readonly derived: CharacterDerived;
  /** Reads the sheet again: a change made here shows without waiting for the live signal. */
  readonly reread: () => void;
}) => ReactNode;

const TABS: readonly { readonly id: HeroTab; readonly label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'skills', label: 'Skills' },
  { id: 'spells', label: 'Spells' },
  { id: 'inventory', label: 'Inventory' },
];

/** Tabs by the WAI-ARIA pattern: arrows, Home and End move and choose; one tab in the Tab order. */
function Tabs({
  idBase,
  tab,
  onTab,
}: {
  readonly idBase: string;
  readonly tab: HeroTab;
  readonly onTab: (tab: HeroTab) => void;
}) {
  const t = useT();
  const refs = useRef(new Map<HeroTab, HTMLButtonElement>());
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = TABS.findIndex((entry) => entry.id === tab);
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % TABS.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + TABS.length) % TABS.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? TABS.length - 1
              : null;
    const chosen = next === null ? undefined : TABS[next];
    if (!chosen) return;
    event.preventDefault();
    onTab(chosen.id);
    refs.current.get(chosen.id)?.focus();
  };
  return (
    <div className="hero-tabs" role="tablist" aria-label={t('Character sheet')} onKeyDown={move}>
      {TABS.map((entry) => (
        <button
          key={entry.id}
          ref={(element) => {
            if (element) refs.current.set(entry.id, element);
          }}
          type="button"
          role="tab"
          id={`${idBase}-tab-${entry.id}`}
          aria-selected={tab === entry.id}
          aria-controls={`${idBase}-panel`}
          tabIndex={tab === entry.id ? 0 : -1}
          className="hero-tab"
          onClick={() => {
            onTab(entry.id);
          }}
        >
          {t(entry.label)}
        </button>
      ))}
    </div>
  );
}

/**
 * The character dialog (Stage 500): a modal like the Chronicle, holding the character's card and
 * the complete sheet in tabs — overview, skills, spells and the pack. It reads the sheet the
 * server allows this perspective (its own character, or any for the DM) with the rules' derived
 * numbers, and re-reads in the background after every change.
 */
export function HeroDialog({
  api,
  revision,
  entityId,
  name,
  kind,
  tab,
  onTab,
  onClose,
  inventory,
  overview,
  notice,
}: {
  readonly api: WorldApi;
  readonly revision: number;
  /** Whose dialog is open; null while closed. */
  readonly entityId: string | null;
  readonly name: string;
  readonly kind: EntityKind;
  readonly tab: HeroTab;
  readonly onTab: (tab: HeroTab) => void;
  readonly onClose: () => void;
  /** The Inventory tab's content for the open character. */
  readonly inventory: ReactNode;
  /** The table's sections of the Overview tab for the shown sheet (Stage 530). */
  readonly overview?: OverviewSections;
  /** The result of the latest action: the world behind a modal is out of reach. */
  readonly notice: ReactNode;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const open = entityId !== null;
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="hero-dialog"
      aria-label={t('Character: {name}', { name })}
      onClose={onClose}
    >
      {entityId !== null && (
        <HeroContent
          key={entityId}
          api={api}
          revision={revision}
          entityId={entityId}
          kind={kind}
          tab={tab}
          onTab={onTab}
          onClose={onClose}
          inventory={inventory}
          overview={overview}
        />
      )}
      {entityId !== null && <div className="hero-notice">{notice}</div>}
    </dialog>
  );
}

function HeroContent({
  api,
  revision,
  entityId,
  kind,
  tab,
  onTab,
  onClose,
  inventory,
  overview,
}: {
  readonly api: WorldApi;
  readonly revision: number;
  readonly entityId: string;
  readonly kind: EntityKind;
  readonly tab: HeroTab;
  readonly onTab: (tab: HeroTab) => void;
  readonly onClose: () => void;
  readonly inventory: ReactNode;
  readonly overview: OverviewSections | undefined;
}) {
  const t = useT();
  const idBase = useId();
  // A person the DM added in words has no sheet until one is set: the server's 404 then says so
  // plainly instead of a failure with Retry (Stage 360).
  const load = useCallback(
    (signal: AbortSignal) =>
      api
        .get<CharacterSheetResponse>(`entities/${encodeURIComponent(entityId)}/sheet`, signal)
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 404) return null;
          throw error;
        }),
    [api, entityId],
  );
  const { resource, retry, reread } = useResource(`hero:${entityId}`, load);
  useRereadOn(revision, reread);
  const image = usePortrait(api, entityId);
  const value = resource.status === 'ready' ? resource.value : null;
  if (resource.status === 'ready' && value === null) {
    return (
      <div className="hero-frame">
        <IconButton
          glyph="close"
          className="hero-close"
          label={t('Close the character sheet')}
          onClick={onClose}
        />
        <div className="hero-status">
          <StatusPanel state="empty" label={t('No character sheet is recorded here.')} />
        </div>
      </div>
    );
  }
  return (
    <div className="hero-frame">
      <IconButton
        glyph="close"
        className="hero-close"
        label={t('Close the character sheet')}
        onClick={onClose}
      />
      {!value ? (
        <div className="hero-status">
          <StatusPanel
            state={resource.status === 'error' ? 'error' : 'loading'}
            label={
              resource.status === 'error'
                ? resource.message
                : t('Loading the full character sheet…')
            }
            onRetry={retry}
          />
        </div>
      ) : (
        <>
          <CharacterCard
            titleId={`${idBase}-title`}
            name={value.entity.name}
            kind={kind}
            image={image}
            sheet={value.sheet}
            derived={value.derived}
          />
          <div className="hero-main">
            <Tabs idBase={idBase} tab={tab} onTab={onTab} />
            <div
              id={`${idBase}-panel`}
              className="hero-panel"
              role="tabpanel"
              aria-labelledby={`${idBase}-tab-${tab}`}
              tabIndex={0}
            >
              {!value.derived ? (
                <StatusPanel state="empty" label={t('No character sheet is recorded here.')} />
              ) : tab === 'overview' ? (
                <>
                  <OverviewTab
                    entityId={entityId}
                    sheet={value.sheet}
                    derived={value.derived}
                    table={overview?.({
                      entityId,
                      sheet: value.sheet,
                      derived: value.derived,
                      reread,
                    })}
                  />
                  {/* The sheet on paper (docs/adr/0056-characters-from-the-srd.md §5). */}
                  <PrintSection api={api} entityId={entityId} value={value} />
                </>
              ) : tab === 'skills' ? (
                <SkillsTab entityId={entityId} derived={value.derived} />
              ) : tab === 'spells' ? (
                <SpellsTab sheet={value.sheet} derived={value.derived} />
              ) : (
                inventory
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
