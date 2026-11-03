import type { EncounterView, EntityRef } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import type { ReactNode } from 'react';

import type { WorldApi } from '../api/client.ts';
import { LevelSection } from '../builder/level-section.tsx';
import { MakeCharacter } from '../builder/make-character.tsx';
import { FeatureSection } from '../character/feature-section.tsx';
import { HeroDialog } from '../character/hero-dialog.tsx';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { InventoryPanel, type Recipient } from '../items/inventory-panel.tsx';
import { useDiceTable } from '../dice/table.tsx';
import { HitDice } from '../rest/sheet-rest.tsx';
import type { Shell } from '../shell/use-shell.ts';

/**
 * The world screen's character dialog (Stage 500): whichever character the shell opened, with its
 * pack in the Inventory tab. Only the acting character's own pack takes actions; the DM reads.
 */
export function WorldHeroDialog({
  api,
  shell,
  revision,
  directory,
  actorId,
  canAct,
  locked,
  encounter,
  recipients,
  onRun,
  notice,
}: {
  readonly api: WorldApi;
  readonly shell: Shell;
  readonly revision: number;
  readonly directory: readonly EntityRef[];
  readonly actorId: string | null;
  readonly canAct: boolean;
  readonly locked: boolean;
  readonly encounter: EncounterView | null;
  readonly recipients: readonly Recipient[];
  readonly onRun: (intent: ExplorationIntent) => void;
  /** The result of the latest action, shown inside the dialog while it is open. */
  readonly notice: ReactNode;
}) {
  const t = useT();
  const isDm = useDiceTable()?.isDm ?? false;
  const shown = directory.find((entity) => entity.entityId === shell.hero);
  const party = directory.filter((entity) => entity.kind === 'character');
  return (
    <HeroDialog
      api={api}
      revision={revision}
      entityId={shell.hero}
      name={shown?.name ?? t('Character')}
      kind={shown?.kind ?? 'character'}
      tab={shell.heroTab}
      onTab={shell.showHeroTab}
      onClose={shell.closeHero}
      notice={notice}
      overview={(shown) => (
        <>
          <HitDice {...shown} locked={locked} onRun={onRun} />
          {/* The class features in play (docs/adr/0056-…md §4). */}
          <FeatureSection
            api={api}
            entityId={shown.entityId}
            sheet={shown.sheet}
            derived={shown.derived}
            party={party}
            canUse={isDm || shown.entityId === actorId}
            locked={locked}
            onRun={onRun}
          />
          {/* Experience and the levels to take (docs/adr/0056-…md §3). */}
          <LevelSection
            api={api}
            characterId={shown.entityId}
            sheet={shown.sheet}
            own={shown.entityId === actorId}
            onChanged={shown.reread}
          />
          {/* A player makes another character of their own (docs/adr/0056-…md §2). */}
          {shown.entityId === actorId && (
            <MakeCharacter
              api={api}
              onMade={() => undefined}
              intro="Make another character of your own: a spare hero, or one for someone who shares your screen."
            />
          )}
        </>
      )}
      inventory={
        <InventoryPanel
          api={api}
          revision={revision}
          characterId={shell.hero}
          canAct={shell.hero === actorId && canAct}
          locked={locked}
          encounter={encounter}
          recipients={recipients}
          onRun={onRun}
        />
      }
    />
  );
}
