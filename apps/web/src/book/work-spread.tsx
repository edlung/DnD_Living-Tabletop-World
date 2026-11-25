import type {
  EntityKind,
  EntityRef,
  OpenedBook,
  PreparedEncounterListResponse,
} from '@ltw/contracts';
import { useCallback, useLayoutEffect } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { useSignInKind } from '../session/sign-in-kind.ts';
import type { Shell } from '../shell/use-shell.ts';
import { useSceneSpread } from '../world/scene-spread.ts';
import { leafAt, leavesOf } from './model.ts';
import type { DmBook } from './use-book.ts';
import { WorkSeals } from './work-seals.tsx';
import { WorkStory } from './work-story.tsx';

/**
 * The DM's working spread (docs/adr/0075-book-interface.md §16): on a screen wide enough for two
 * pages, and outside a fight, the Scene is the spread the game is run from. The left page is the
 * story where the party is; the right page is the place — its plate, who and what is here under
 * it — with the DM's actions as seals at its foot. The Scene itself (the world's own view) is
 * unchanged: it stands on the right page under the plate, and the stylesheet lays it there
 * (`styles/work-spread.css`) while this is mounted. Narrower, in a fight, and for a player, the
 * Scene stays as it was.
 */
export function WorkSpread({
  api,
  shell,
  book,
  directory,
  placeId,
  fighting,
  evening,
  locked,
  onRun,
  onEntity,
}: {
  readonly api: WorldApi;
  readonly shell: Shell;
  readonly book: DmBook;
  readonly directory: readonly EntityRef[];
  /** The place the Scene shows; null while the world loads. */
  readonly placeId: string | null;
  readonly fighting: boolean;
  /** A session plays: between sessions the story's page offers to begin the evening. */
  readonly evening: boolean;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
  readonly onEntity: (entityId: string, kind: EntityKind) => void;
}) {
  const spread = useSceneSpread(fighting);
  if (!book.opened || !spread || fighting || placeId === null) return null;
  return (
    <Working
      api={api}
      shell={shell}
      book={book}
      opened={book.opened}
      directory={directory}
      placeId={placeId}
      evening={evening}
      locked={locked}
      onRun={onRun}
      onEntity={onEntity}
    />
  );
}

function Working({
  api,
  shell,
  book,
  opened,
  directory,
  placeId,
  evening,
  locked,
  onRun,
  onEntity,
}: {
  readonly api: WorldApi;
  readonly shell: Shell;
  readonly book: DmBook;
  readonly opened: OpenedBook;
  readonly directory: readonly EntityRef[];
  readonly placeId: string;
  readonly evening: boolean;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
  readonly onEntity: (entityId: string, kind: EntityKind) => void;
}) {
  const screenPage = useSignInKind() === 'session';
  const load = useCallback(
    (signal: AbortSignal) =>
      api.get<PreparedEncounterListResponse>('encounters/prepared', signal, false),
    [api],
  );
  const prepared = useResource('work-prepared-encounters', load);
  const encounters = prepared.resource.status === 'ready' ? prepared.resource.value.encounters : [];
  // The right page is the Scene's own block: its head, the plate's place, then who and what is
  // here. The picture and the card take the plate's place, so what stands above it and below it
  // is kept on the world screen (`--head-h`, `--here-h`).
  useLayoutEffect(() => {
    const host = document.getElementById('world-main');
    const scene = host?.querySelector<HTMLElement>('.scene[data-spread]');
    const slot = scene?.querySelector<HTMLElement>('.scene-plate-slot');
    if (!host || !scene || !slot) return;
    let last = '';
    let frame: number | undefined;
    const measure = () => {
      const whole = scene.getBoundingClientRect();
      const plate = slot.getBoundingClientRect();
      const head = Math.max(0, Math.round(plate.top - whole.top));
      const here = Math.max(0, Math.round(whole.bottom - plate.bottom));
      const now = `${String(head)}:${String(here)}`;
      if (now === last) return;
      last = now;
      host.style.setProperty('--head-h', `${String(head)}px`);
      host.style.setProperty('--here-h', `${String(here)}px`);
    };
    measure();
    const observer = new ResizeObserver(() => {
      if (frame !== undefined) return;
      frame = requestAnimationFrame(() => {
        frame = undefined;
        measure();
      });
    });
    observer.observe(scene);
    observer.observe(slot);
    return () => {
      observer.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
      host.style.removeProperty('--head-h');
      host.style.removeProperty('--here-h');
    };
  }, [placeId]);
  const leaf = leafAt(leavesOf(opened.content), book.place.ribbon);
  // Another page of the book lies over the Scene: the spread under it takes no key and no press.
  const covered = shell.sheet !== null;
  if (!leaf) return null;
  return (
    <>
      <WorkStory
        book={book}
        opened={opened}
        directory={directory}
        placeId={placeId}
        covered={covered}
        onEvening={
          evening
            ? null
            : () => {
                shell.openSheet('session');
              }
        }
        onBook={() => {
          shell.openSheet('book');
        }}
        onEntity={onEntity}
      />
      <WorkSeals
        api={api}
        opened={opened}
        leaf={leaf}
        heroes={directory.filter((entity) => entity.kind === 'character')}
        encounters={encounters}
        placeId={placeId}
        locked={locked}
        covered={covered}
        screenPage={screenPage}
        onRun={onRun}
        onPage={shell.openSheet}
      />
    </>
  );
}
