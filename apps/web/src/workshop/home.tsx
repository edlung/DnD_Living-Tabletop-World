import { OwnedCampaigns } from './campaigns/list.tsx';
import type { WorkshopClient } from './client.ts';
import { WorkshopDrafts } from './drafts.tsx';

export function WorkshopHome({
  client,
  ownerId,
  onEnded,
  onOpen,
}: {
  readonly client: WorkshopClient;
  readonly ownerId: string;
  readonly onEnded: () => void;
  readonly onOpen: (draftId: string) => void;
}) {
  return (
    <div className="workshop-home">
      <WorkshopDrafts ownerId={ownerId} onEnded={onEnded} onOpen={onOpen} />
      <OwnedCampaigns client={client} onOpenDraft={onOpen} />
    </div>
  );
}
