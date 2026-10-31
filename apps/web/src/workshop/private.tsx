import '../i18n/ru-workshop-editor.ts';
import '../i18n/ru-workshop-scenario.ts';
import '../i18n/ru-workshop-preview.ts';
import '../i18n/ru-workshop-editing.ts';
import '../i18n/ru-workshop-activation.ts';
import '../styles/workshop-editor.css';
import '../styles/workshop-generation.css';
import '../styles/workshop-scenario.css';
import '../styles/workshop-preview.css';
import '../styles/workshop-pictures.css';
import '../styles/workshop-editing.css';
import '../styles/workshop-activation.css';

import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useT } from '@ltw/ui';

import { WorkshopClient } from './client.ts';
import { WorkshopHome } from './home.tsx';
import { DraftEditor } from './editor.tsx';
import { workshopDraftPath, workshopRoute } from './route.ts';
import { useWorkshopSession } from './use-workshop-session.ts';

export function WorkshopPrivate({
  ownerId,
  onEnded,
  onRestricted,
}: {
  readonly ownerId: string;
  readonly onEnded: () => void;
  readonly onRestricted: (restricted: boolean) => void;
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
      onRestricted(false);
      setRoute(workshopRoute(window.location.pathname));
    };
    window.addEventListener('popstate', pop);
    return () => {
      window.removeEventListener('popstate', pop);
    };
  }, [onRestricted]);
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
        onRestricted={onRestricted}
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
    <WorkshopHome
      client={client}
      ownerId={ownerId}
      onEnded={onEnded}
      onOpen={(id) => {
        navigate(workshopDraftPath(id));
      }}
    />
  );
}
