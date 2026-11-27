import type { RollEntry } from '@ltw/contracts';
import { useEffect, useState } from 'react';
import { RollPlayback } from './roll-playback.tsx';
import { useDiceTable } from './table.tsx';

/** The player's or DM's own queue. The landing joins their log and is announced once. */
export function DiceStage({ onAnnounce }: { readonly onAnnounce: (entry: RollEntry) => void }) {
  const table = useDiceTable();
  const [queue, setQueue] = useState<readonly RollEntry[]>([]);
  useEffect(() => {
    if (!table || table.fresh.length === 0) return;
    setQueue((queued) => [...queued, ...table.fresh]);
    table.takeFresh();
  }, [table?.fresh]);
  return (
    <RollPlayback
      entry={queue[0] ?? null}
      isDm={table?.isDm ?? false}
      onLanded={(entry) => {
        table?.land(entry.rollId);
        onAnnounce(entry);
      }}
      onDone={(entry) => {
        setQueue((queued) => queued.filter((item) => item.rollId !== entry.rollId));
      }}
    />
  );
}
