import type {
  CharacterDerived,
  CharacterSheet,
  CharacterSheetResponse,
  EntityKind,
} from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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
import { UnsavedContext, type Unsaved } from './story/unsaved.ts';

/** Sections the world adds to the Overview tab for the sheet shown. */
export type OverviewSections = (shown: {
  readonly entityId: string;
  readonly sheet: CharacterSheet;
  readonly derived: CharacterDerived;
  /** Reads the sheet again: a change made here shows without waiting for the live signal. */
  readonly reread: () => void;
  /** The portrait its player asked for, while the DM has not requested it (ADR 0056 §5). */
  readonly portraitWish: string | null;
}) => ReactNode;

interface TabEntry {
  readonly id: HeroTab;
  readonly label: string;
}

const TABS: readonly TabEntry[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'skills', label: 'Skills' },
  { id: 'spells', label: 'Spells' },
  { id: 'inventory', label: 'Inventory' },
];
/** A hero's backstory and its player's notes (docs/adr/0073-table-ideas.md §5): where there is one. */
const STORY_TAB: TabEntry = { id: 'story', label: 'Story' };

/** Tabs by the WAI-ARIA pattern: arrows, Home and End move and choose; one tab in the Tab order. */
function Tabs({
  idBase,
  tabs,
  tab,
  onTab,
}: {
  readonly idBase: string;
  readonly tabs: readonly TabEntry[];
  readonly tab: HeroTab;
  readonly onTab: (tab: HeroTab) => void;
}) {
  const t = useT();
  const refs = useRef(new Map<HeroTab, HTMLButtonElement>());
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((entry) => entry.id === tab);
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : null;
    const chosen = next === null ? undefined : tabs[next];
    if (!chosen) return;
    event.preventDefault();
    onTab(chosen.id);
    refs.current.get(chosen.id)?.focus();
  };
  return (
    <div className="hero-tabs" role="tablist" aria-label={t('Character sheet')} onKeyDown={move}>
      {tabs.map((entry) => (
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
  story,
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
  /**
   * The Story tab's content — the hero's backstory, its player's notes (ADR 0073 §5) — where the
   * reader has one: its own player, or the DM. Absent: no such tab.
   */
  readonly story?: ReactNode;
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
  // Words typed on the Story tab and not saved (ADR 0073 §5): the sheet asks before it closes.
  const dirty = useRef(new Set<string>());
  const unsaved = useMemo<Unsaved>(
    () => ({
      report: (key, is) => {
        if (is) dirty.current.add(key);
        else dirty.current.delete(key);
      },
    }),
    [],
  );
  const [asking, setAsking] = useState(false);
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (asking) keep.current?.focus();
  }, [asking]);
  const close = () => {
    if (dirty.current.size > 0) setAsking(true);
    else onClose();
  };
  return (
    <dialog
      ref={ref}
      className="hero-dialog"
      aria-label={t('Character: {name}', { name })}
      onCancel={(event) => {
        if (dirty.current.size === 0) return;
        event.preventDefault();
        setAsking(true);
      }}
      onClose={() => {
        dirty.current.clear();
        setAsking(false);
        onClose();
      }}
    >
      {asking && (
        <div className="hero-unsaved" role="group" aria-label={t('Unsaved words')}>
          <p role="alert">{t('You have not saved what you wrote. Close anyway?')}</p>
          <div className="action-row">
            <button
              ref={keep}
              type="button"
              className="primary-button"
              onClick={() => {
                setAsking(false);
              }}
            >
              {t('Keep writing')}
            </button>
            <button
              type="button"
              onClick={() => {
                dirty.current.clear();
                setAsking(false);
                onClose();
              }}
            >
              {t('Close without saving')}
            </button>
          </div>
        </div>
      )}
      {entityId !== null && (
        <UnsavedContext.Provider value={unsaved}>
          <HeroContent
            key={entityId}
            api={api}
            revision={revision}
            entityId={entityId}
            kind={kind}
            tab={tab}
            onTab={onTab}
            onClose={close}
            inventory={inventory}
            overview={overview}
            story={story}
          />
        </UnsavedContext.Provider>
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
  story,
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
  readonly story: ReactNode;
}) {
  const t = useT();
  const idBase = useId();
  const hasStory = story !== undefined && story !== null && story !== false;
  const tabs = hasStory ? [...TABS, STORY_TAB] : TABS;
  // A sheet without the Story tab, opened where one was last read: its first tab.
  const shownTab: HeroTab = tab === 'story' && !hasStory ? 'overview' : tab;
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
            <Tabs idBase={idBase} tabs={tabs} tab={shownTab} onTab={onTab} />
            <div
              id={`${idBase}-panel`}
              className="hero-panel"
              role="tabpanel"
              aria-labelledby={`${idBase}-tab-${shownTab}`}
              tabIndex={0}
            >
              {/* The Story tab stays where it is while another tab shows: what is typed there
                  and not saved is not lost to a look at the pack. */}
              {hasStory && <div hidden={shownTab !== 'story'}>{story}</div>}
              {shownTab === 'story' ? null : !value.derived ? (
                <StatusPanel state="empty" label={t('No character sheet is recorded here.')} />
              ) : shownTab === 'overview' ? (
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
                      portraitWish: value.portraitWish ?? null,
                    })}
                  />
                  {/* The sheet on paper (docs/adr/0056-characters-from-the-srd.md §5). */}
                  <PrintSection api={api} entityId={entityId} value={value} />
                </>
              ) : shownTab === 'skills' ? (
                <SkillsTab entityId={entityId} derived={value.derived} />
              ) : shownTab === 'spells' ? (
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
