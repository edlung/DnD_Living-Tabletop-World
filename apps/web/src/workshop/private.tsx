import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useT } from '@ltw/ui';

import { WorkshopClient } from './client.ts';
import { WorkshopDrafts } from './drafts.tsx';
import { DraftEditor } from './editor.tsx';
import { workshopDraftPath, workshopRoute } from './route.ts';
import { useWorkshopSession } from './use-workshop-session.ts';

export function WorkshopPrivate({
  ownerId,
  onEnded,
}: {
  readonly ownerId: string;
  readonly onEnded: () => void;
}) {
  const t = useT();
  useWorkshopSession(ownerId, onEnded);
  const client = useMemo(() => new WorkshopClient(ownerId, onEnded), [ownerId, onEnded]);
  useLayoutEffect(() => {
    client.open();
    return () => {
      client.release();
    };
  }, [client]);
  const [route, setRoute] = useState(() => workshopRoute(window.location.pathname));
  useEffect(() => {
    const pop = () => {
      setRoute(workshopRoute(window.location.pathname));
    };
    window.addEventListener('popstate', pop);
    return () => {
      window.removeEventListener('popstate', pop);
    };
  }, []);
  const navigate = (path: string) => {
    window.history.pushState(null, '', path);
    setRoute(workshopRoute(path));
  };
  if (route.kind === 'draft')
    return (
      <DraftEditor
        key={route.draftId}
        client={client}
        draftId={route.draftId}
        onBack={() => {
          navigate('/workshop');
        }}
      />
    );
  if (route.kind === 'missing')
    return (
      <section className="workshop-panel">
        <h2>{t('This draft is not available')}</h2>
        <button
          onClick={() => {
            navigate('/workshop');
          }}
        >
          {t('Back to the workshop')}
        </button>
      </section>
    );
  return (
    <WorkshopDrafts
      ownerId={ownerId}
      onEnded={onEnded}
      onOpen={(id) => {
        navigate(workshopDraftPath(id));
      }}
    />
  );
}
