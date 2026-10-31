import { campaignRevisionConflictSchema, type CampaignPackage } from '@ltw/contracts';
import { useEffect, useRef, useState } from 'react';

import type { WorkshopClient } from '../client.ts';
import { revisionViewSchema } from '../response-schemas.ts';
import type { EditingContext } from './schemas.ts';

interface Payload {
  readonly requestId: string;
  readonly basedOnRevision: number;
  readonly content: CampaignPackage;
  readonly expectedLockVersion: number;
  readonly expectedManifestVersion: number;
  readonly expectedManifestDigest: string;
}
export interface ManualDraftBuffer {
  readonly baseDigest: string;
  readonly baseRevision: number;
  readonly base: CampaignPackage;
  readonly value: unknown;
}

/** A write owns its exact baseline/CAS/nonce until confirmed or explicitly discarded. */
export function useScenarioSave({
  client,
  draftId,
  context,
  contextKey,
  writable,
  bufferBaseDigest,
  onSaved,
  onConflict,
}: {
  readonly client: WorkshopClient;
  readonly draftId: string;
  readonly context: EditingContext | null;
  readonly contextKey: string;
  readonly writable: boolean;
  readonly bufferBaseDigest: string | null;
  readonly onSaved: (revision: number) => void;
  readonly onConflict: () => void;
}) {
  const [state, setState] = useState<'idle' | 'saving' | 'uncertain' | 'conflict'>('idle'),
    [conflict, setConflict] = useState<unknown>(null);
  const pending = useRef<Payload | null>(null),
    baseline = useRef<{ base: CampaignPackage; digest: string } | null>(null);
  const alive = useRef(true),
    writing = useRef<AbortController | null>(null),
    current = useRef(contextKey);
  current.current = contextKey;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const discard = () => {
    pending.current = null;
    baseline.current = null;
    setState('idle');
    setConflict(null);
  };
  useEffect(() => {
    const controller = new AbortController();
    writing.current = controller;
    discard();
    return () => {
      controller.abort();
    };
  }, [contextKey]);
  const save = async (
    content: CampaignPackage,
  ): Promise<'saved' | 'conflict' | 'uncertain' | 'failed'> => {
    if (!context || !writable) return 'failed';
    if (bufferBaseDigest !== null && bufferBaseDigest !== context.revision.digest) {
      setState('conflict');
      return 'conflict';
    }
    const payload = pending.current ?? {
      requestId: crypto.randomUUID(),
      basedOnRevision: context.revision.revision,
      content,
      expectedLockVersion: context.locks.version,
      expectedManifestVersion: context.manifest.version,
      expectedManifestDigest: context.manifest.digest,
    };
    if (JSON.stringify(payload.content) !== JSON.stringify(content)) {
      setState('uncertain');
      return 'uncertain';
    }
    pending.current = payload;
    baseline.current ??= { base: context.revision.content, digest: context.revision.digest };
    setState('saving');
    setConflict(null);
    const started = contextKey;
    const result = await client.request(`/drafts/${draftId}/revisions`, revisionViewSchema, {
      body: payload,
      conflictSchema: campaignRevisionConflictSchema,
      ...(writing.current ? { signal: writing.current.signal } : {}),
    });
    if (!alive.current || current.current !== started) return 'failed';
    if (result.kind === 'conflict') {
      setState('conflict');
      setConflict(result.details ?? null);
      onConflict();
      return 'conflict';
    }
    if (result.kind !== 'ready' || !result.value.revision) {
      setState('uncertain');
      return 'uncertain';
    }
    discard();
    onSaved(result.value.revision.revision);
    return 'saved';
  };
  return {
    state,
    conflict,
    save,
    discard,
    retry: () => {
      const value = pending.current;
      if (value) void save(value.content);
    },
    keepChanges: (): ManualDraftBuffer | null => {
      const value = pending.current,
        base = baseline.current;
      const buffer =
        value && base
          ? {
              baseDigest: base.digest,
              baseRevision: value.basedOnRevision,
              base: base.base,
              value: value.content,
            }
          : null;
      discard();
      return buffer;
    },
  };
}
