import type { EncounterView, EntityKind, PlayerAssetView } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { BuilderDialog } from '../builder/builder-dialog.tsx';
import { Requests } from '../dice/requests-log.tsx';
import { useDiceTable } from '../dice/table.tsx';
import { handoutElementId } from '../handouts/handouts.tsx';
import { Sheet } from '../shell/sheet.tsx';
import { focusOn, type SheetId, type HeroTab, type Shell } from '../shell/use-shell.ts';
import { Glyph } from '../visual/glyph.tsx';
import type { GlyphName } from '../visual/ui-kit-names.ts';
import { PartyRail } from './party-rail.tsx';
import { JournalQuests } from './journal-quests.tsx';
import { LighthouseDock } from './lighthouse-dock.tsx';
import { useApprovedImage } from '../visual/approved-images.ts';
import { LighthouseProfile } from './lighthouse-profile.tsx';

export interface PlayerBookSeat {
  readonly campaignId: string;
  readonly onCreated: (characterId: string) => void;
}

const leaves = [
  ['adventure', 'Adventure', 'map'],
  ['journal', 'Field journal', 'journal'],
  ['party', 'Party', 'party'],
  ['evening', 'Table gathering', 'dawn'],
] as const;
export type PlayerPage = (typeof leaves)[number][0];

function lastLeaf(key: string): PlayerPage {
  try {
    const saved = sessionStorage.getItem(key);
    return leaves.find(([id]) => id === saved)?.[0] ?? 'adventure';
  } catch {
    return 'adventure';
  }
}

interface Link {
  readonly title: string;
  readonly glyph: GlyphName;
  readonly go: () => void;
  readonly sheet?: SheetId;
  readonly count?: number;
}

function Links({ links }: { readonly links: readonly Link[] }) {
  return (
    <ul className="folio-links">
      {links.map((link) => (
        <li key={link.title}>
          <button
            type="button"
            onClick={link.go}
            data-book-sheet={link.sheet}
            data-folio-tool={link.glyph}
          >
            <Glyph name={link.glyph} />
            <span>{link.title}</span>
            {link.count ? (
              <strong className="folio-count">{link.count}</strong>
            ) : (
              <Glyph name="chevron-right" />
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function LighthouseFolio({
  api,
  shell,
  actorId,
  name,
  place,
  stageArt,
  stageName,
  battlefield,
  encounter,
  revision,
  onSelect,
  onMeetingSlot,
  onReturn,
  onCreated,
}: {
  readonly api: WorldApi;
  readonly shell: Shell;
  readonly actorId: string;
  readonly name: string;
  readonly place: string | undefined;
  readonly stageName: string | null;
  readonly stageArt: PlayerAssetView | null;
  readonly battlefield: boolean;
  readonly encounter: EncounterView | null;
  readonly revision: number;
  readonly onSelect: (id: string, kind: EntityKind) => void;
  readonly onMeetingSlot: (node: HTMLDivElement | null) => void;
  readonly onReturn: () => void;
  readonly onCreated: PlayerBookSeat['onCreated'];
}) {
  const t = useT();
  const table = useDiceTable();
  const storage = 'ltw.player-book:' + api.campaignId + ':' + actorId;
  const [leaf, setLeaf] = useState<PlayerPage>(() => lastLeaf(storage));
  const [making, setMaking] = useState(false);
  const pageId = useId();
  const open = shell.sheet === 'player-book';
  const ownTurn = encounter?.currentCombatantId === actorId;
  const go = (next: PlayerPage) => {
    setLeaf(next);
    try {
      sessionStorage.setItem(storage, next);
    } catch {
      /* The tab still works without storage. */
    }
  };
  const route = (sheet: SheetId, glyph: GlyphName, title: string, count = 0): Link => ({
    sheet,
    glyph,
    title: t(title),
    count,
    go: () => {
      shell.openSheetFromBook(sheet);
    },
  });
  const showHandout = (id: string) => {
    table?.readHandout(id);
    shell.openSheetFromBook('journal');
    requestAnimationFrame(() => {
      const target = document.getElementById(handoutElementId(id));
      if (focusOn(target)) target?.scrollIntoView({ block: 'center' });
    });
  };
  const talk = route('chat', 'talk', 'Messages at the table', table?.chat.unread);
  const rules = route('rules', 'study', 'Rules');
  const chronicle: Link = {
    glyph: 'chronicle',
    title: t('Chronicle'),
    go: () => {
      shell.openChronicle();
    },
  };
  const shared = table?.online ? [route('shared', 'live', 'Table screen')] : [];
  const unread = table?.unreadHandouts ?? [];
  const heading = leaves.find(([id]) => id === leaf);
  const hero = (tab: HeroTab) => {
    shell.openHero(actorId, tab);
  };
  return (
    <>
      <Sheet
        id="player-book"
        glyph="chapter"
        title={t('Player’s book')}
        open={open}
        onClose={shell.closeSheet}
      >
        {open && (
          <div className="player-folio" data-leaf={leaf}>
            <nav className="folio-bookmarks" aria-label={t('Pages of your book')}>
              {leaves.map(([id, label, glyph]) => (
                <button
                  key={id}
                  id={pageId + '-' + id}
                  type="button"
                  aria-current={leaf === id ? 'page' : undefined}
                  aria-controls={pageId}
                  onClick={() => {
                    go(id);
                  }}
                >
                  <Glyph name={glyph} />
                  {t(label)}
                </button>
              ))}
            </nav>
            <div className="folio-notices" aria-live="polite">
              {ownTurn && (
                <button type="button" className="folio-turn-call" onClick={onReturn}>
                  <Glyph name="encounter" />
                  {t('Your turn · open battlefield')}
                </button>
              )}
              <Requests characters={[]} />
              {table?.error && <p role="alert">{table.error}</p>}
              {unread.map((item) => (
                <button
                  key={item.handoutId}
                  type="button"
                  className="folio-new-handout"
                  onClick={() => {
                    showHandout(item.handoutId);
                  }}
                >
                  <Glyph name="journal" />
                  {t('Read new handout: {title}', { title: item.title })}
                </button>
              ))}
            </div>
            <LighthouseProfile
              api={api}
              actorId={actorId}
              revision={revision}
              name={name}
              place={place}
              onHero={(tab) => {
                shell.openHero(actorId, tab);
              }}
              onCreate={() => {
                setMaking(true);
              }}
            />
            <section className="folio-index" id={pageId} aria-labelledby={pageId + '-' + leaf}>
              <div className="folio-page-heading">
                <h3>{heading && t(heading[1])}</h3>
                {encounter && (
                  <button type="button" className="folio-fight-round" onClick={onReturn}>
                    <Glyph name="encounter" />
                    {ownTurn ? t('Your turn') : t('Round {round}', { round: encounter.round })}
                  </button>
                )}
              </div>
              {leaf === 'adventure' && (
                <>
                  <SceneRibbon
                    art={stageArt}
                    name={stageName}
                    fight={encounter !== null}
                    onOpen={onReturn}
                  />
                  <Links
                    links={[
                      route('dice', 'roll', 'Rolls and requests'),
                      {
                        glyph: 'inspect',
                        title: t('Pack and equipment'),
                        go: () => {
                          shell.openHero(actorId, 'inventory');
                        },
                      },
                      {
                        glyph: 'cast',
                        title: t('Spells'),
                        go: () => {
                          shell.openHero(actorId, 'spells');
                        },
                      },
                      route('places', 'map', 'Places and travel'),
                      route('journal', 'journal', 'Discoveries and handouts'),
                      talk,
                      chronicle,
                    ]}
                  />
                </>
              )}
              {leaf === 'journal' && (
                <>
                  <Links
                    links={[
                      {
                        glyph: 'bookmark',
                        title: t('Personal notes and backstory'),
                        go: () => {
                          shell.openHero(actorId, 'story');
                        },
                      },
                      route('journal', 'journal', 'Discoveries and handouts'),
                      chronicle,
                    ]}
                  />
                  <JournalQuests api={api} revision={revision} />
                  {table && table.handouts.length > 0 && (
                    <section className="folio-handouts">
                      <h4>{t('Handouts')}</h4>
                      <ul className="folio-links">
                        {[...table.handouts].reverse().map((item) => (
                          <li key={item.handoutId}>
                            <button
                              type="button"
                              onClick={() => {
                                showHandout(item.handoutId);
                              }}
                            >
                              <Glyph name="journal" />
                              <span>{item.title}</span>
                              <Glyph name="chevron-right" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </>
              )}
              {leaf === 'party' && (
                <>
                  <PartyRail
                    api={api}
                    encounter={encounter}
                    selectedId={null}
                    inBook
                    onSelect={(id, kind) => {
                      if (id === actorId) shell.openHero(id, 'overview');
                      else onSelect(id, kind);
                    }}
                  />
                  <Links links={[talk, ...shared]} />
                </>
              )}
              {leaf === 'evening' && (
                <>
                  <div className="folio-meeting" ref={onMeetingSlot} />
                  <Links links={[rules, ...shared, chronicle]} />
                </>
              )}
              {leaf !== 'adventure' && (
                <button type="button" className="folio-return" onClick={onReturn}>
                  <Glyph name={encounter ? 'encounter' : 'look'} />
                  {t(encounter ? 'Return to the battlefield' : 'Return to the scene')}
                </button>
              )}
            </section>
          </div>
        )}
      </Sheet>
      <LighthouseDock
        battlefield={battlefield}
        shell={shell}
        fight={encounter !== null}
        ownTurn={ownTurn}
        onTable={onReturn}
        onHero={hero}
        onCreate={() => {
          setMaking(true);
        }}
        onPage={(page) => {
          go(page);
          shell.openSheet('player-book');
          requestAnimationFrame(() => {
            focusOn(document.getElementById(pageId + '-' + page));
          });
        }}
      />
      <BuilderDialog
        api={api}
        open={making}
        onClose={() => {
          setMaking(false);
        }}
        onMade={(id) => {
          setMaking(false);
          shell.dismissSheet();
          onCreated(id);
        }}
      />
    </>
  );
}

function SceneRibbon({
  art,
  name,
  fight,
  onOpen,
}: {
  readonly art: PlayerAssetView | null;
  readonly name: string | null;
  readonly fight: boolean;
  readonly onOpen: () => void;
}) {
  const t = useT();
  const url = useApprovedImage(art);
  const label = t(fight ? 'Return to the battlefield' : 'Return to the scene');
  return (
    <button type="button" className="folio-scene-ribbon" onClick={onOpen} aria-label={label}>
      {url && <img src={url} alt="" />}
      <span>
        <small>{t(fight ? 'Battlefield' : 'Scene')}</small>
        <strong>{name ?? label}</strong>
      </span>
      <Glyph name="chevron-right" />
    </button>
  );
}
