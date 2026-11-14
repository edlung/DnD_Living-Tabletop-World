import type { CampaignPackage } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useRef, useState } from 'react';

import type { WorkshopClient } from './client.ts';
import { CampaignLibraryPick } from './library-pick.tsx';
import { MAX_PACKAGE_FILE_BYTES, parsePackageFile } from './package-file.ts';
import { revisionViewSchema } from './response-schemas.ts';
import { useRequestSignal } from './use-request-signal.ts';

type Upload = {
  requestId: string;
  basedOnRevision: 0;
  expectedLockVersion: 0;
  content: CampaignPackage;
};

/** Empty owner draft only. A selected file is previewed, then explicitly saved as an OWNER revision. */
export function CampaignPackageImport({
  client,
  draftId,
  onSaved,
  onPendingChanged,
  onReload,
}: {
  readonly client: WorkshopClient;
  readonly draftId: string;
  readonly onSaved: (revision: number) => void;
  readonly onPendingChanged: (pending: boolean) => void;
  readonly onReload: () => void;
}) {
  const t = useT(),
    signal = useRequestSignal();
  const [upload, setUpload] = useState<Upload | null>(null);
  const [state, setState] = useState<
    'idle' | 'reading' | 'invalid' | 'saving' | 'uncertain' | 'conflict'
  >('idle');
  const sequence = useRef(0),
    input = useRef<HTMLInputElement>(null),
    sending = useRef(false);
  const held = state === 'saving' || state === 'uncertain' || state === 'conflict';
  useEffect(() => {
    onPendingChanged(upload !== null || state === 'reading');
    return () => {
      onPendingChanged(false);
    };
  }, [upload, state, onPendingChanged]);
  const read = async (file: File | undefined) => {
    const ticket = ++sequence.current,
      active = signal();
    setUpload(null);
    if (!file) {
      setState('idle');
      return;
    }
    setState('reading');
    let content: CampaignPackage | null = null;
    try {
      if (file.size <= MAX_PACKAGE_FILE_BYTES) content = parsePackageFile(await file.text());
    } catch {
      /* Fixed user-facing error below. */
    }
    if (active.aborted || ticket !== sequence.current) return;
    setUpload(
      content
        ? { requestId: crypto.randomUUID(), basedOnRevision: 0, expectedLockVersion: 0, content }
        : null,
    );
    setState(content ? 'idle' : 'invalid');
  };
  const save = async () => {
    if (!upload || sending.current) return;
    sending.current = true;
    const active = signal();
    setState('saving');
    const result = await client.request(`/drafts/${draftId}/revisions`, revisionViewSchema, {
      body: upload,
      signal: active,
    });
    sending.current = false;
    if (active.aborted) return;
    if (result.kind === 'ready' && result.value.revision) {
      setUpload(null);
      setState('idle');
      onSaved(result.value.revision.revision);
    } else setState(result.kind === 'conflict' ? 'conflict' : 'uncertain');
  };
  return (
    <section
      className="workshop-panel campaign-package-import"
      aria-label={t('Import a prepared campaign')}
    >
      {!upload && (
        <CampaignLibraryPick
          client={client}
          disabled={held || state === 'reading'}
          onPick={(content) => {
            sequence.current++;
            if (input.current) input.current.value = '';
            setUpload({
              requestId: crypto.randomUUID(),
              basedOnRevision: 0,
              expectedLockVersion: 0,
              content,
            });
            setState('idle');
          }}
        />
      )}
      <h3>{t('Import a prepared campaign')}</h3>
      <p>
        {t(
          'Choose a campaign JSON file. Review it here before saving. Starting the campaign is a separate step.',
        )}
      </p>
      <label htmlFor="campaign-package-file">{t('Campaign package file')}</label>
      <input
        ref={input}
        id="campaign-package-file"
        type="file"
        accept=".json,application/json"
        disabled={held}
        onChange={(e) => {
          void read(e.target.files?.[0]);
        }}
      />
      {state === 'reading' && <p role="status">{t('Reading the package…')}</p>}
      {state === 'invalid' && (
        <p role="alert">
          {t(
            'Choose a valid campaign package up to 512 KiB. Exported revisions are not package files.',
          )}
        </p>
      )}
      {upload && (
        <>
          <h4>{upload.content.world.name}</h4>
          <p>
            {t('Scenario objects')}: {upload.content.entities.length} · {t('Situations')}:{' '}
            {upload.content.situations.length} · {t('Encounters')}:{' '}
            {upload.content.encounters.length}
          </p>
          <button
            type="button"
            disabled={state === 'saving' || state === 'conflict'}
            onClick={() => {
              void save();
            }}
          >
            {state === 'uncertain'
              ? t('Retry original package save')
              : state === 'saving'
                ? t('Saving…')
                : t('Save package to this draft')}
          </button>
          {!held && (
            <button
              type="button"
              onClick={() => {
                sequence.current++;
                setUpload(null);
                setState('idle');
                if (input.current) input.current.value = '';
              }}
            >
              {t('Clear selected package')}
            </button>
          )}
        </>
      )}
      {state === 'uncertain' && (
        <p role="status">
          {t('The save could not be confirmed. Retry keeps the same package and request.')}
        </p>
      )}
      {state === 'conflict' && (
        <>
          <p role="status">
            {t(
              'This draft already changed. Reload its saved content; the file will not overwrite it.',
            )}
          </p>
          <button type="button" onClick={onReload}>
            {t('Reload saved content')}
          </button>
        </>
      )}
    </section>
  );
}
