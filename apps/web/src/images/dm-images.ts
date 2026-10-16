import type { AssetLineageResponse, CommandResult } from '@ltw/contracts';
import { useT, type Translate } from '@ltw/ui';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { ApiError, type WorldApi } from '../api/client.ts';
import { useResource, type Resource } from '../api/resource.ts';
import { rejectionMessage } from '../exploration/outcome-messages.ts';
import { useRereadOn } from '../world/use-world-data.ts';
import type { ImageCommand } from './lineage.ts';

/**
 * The DM's image controls (docs/STAGE_330_DESIGN.md "DM controls"): the campaign's asset lineage,
 * read in the DM perspective only (`GET …/assets`, never for a lower perspective), and the DM's
 * image commands — request, approve, discard — sent one at a time through the existing command
 * route. The lineage re-reads after each own command and on every live signal (the DM's
 * coverage includes it), so a job is followed from the request to its candidate as the asset
 * worker reports it, and nothing is ever shown that the server did not say.
 */
export interface ImageCommandState {
  readonly status: 'idle' | 'busy' | 'uncertain' | 'done';
  readonly message: string | null;
  /** Where the command was given (an entity's panel, the Images sheet): its result shows there. */
  readonly place: string | null;
  /** Once done: whether the world accepted it (a refusal keeps the DM's draft). */
  readonly accepted: boolean;
}

export interface DmImages {
  readonly lineage: Resource<AssetLineageResponse | null>;
  readonly retryRead: () => void;
  readonly command: ImageCommandState;
  /** A command is in flight or its answer was lost: one at a time. */
  readonly busy: boolean;
  /** Sends one command; `success` is the message to show when the world accepts it. */
  readonly run: (place: string, command: ImageCommand, success: string) => void;
  /** Sends the same command again after a lost answer (the same command ID, so never twice). */
  readonly retry: () => void;
}

/** Present only in the DM perspective: a lower perspective has no image controls at all. */
export const DmImagesContext = createContext<DmImages | null>(null);

export const useDmImages = (): DmImages | null => useContext(DmImagesContext);

interface Attempt {
  readonly place: string;
  readonly command: ImageCommand;
  readonly success: string;
  readonly commandId: string;
}

function refusal(t: Translate, code: string): string {
  return code === 'INVALID_ASSET'
    ? t('This picture changed meanwhile; the list now shows it as it is.')
    : rejectionMessage(t, code);
}

export function useDmImagesState(
  api: WorldApi,
  isDm: boolean,
  revision: number,
  onChanged: () => void,
): DmImages {
  const t = useT();
  const load = useCallback(
    (signal: AbortSignal) =>
      isDm ? api.get<AssetLineageResponse>('assets', signal, false) : Promise.resolve(null),
    [api, isDm],
  );
  const { resource, retry: retryRead, reread } = useResource('asset-lineage', load);
  useRereadOn(revision, reread);
  const [command, setCommand] = useState<ImageCommandState>({
    status: 'idle',
    message: null,
    place: null,
    accepted: false,
  });
  const pending = useRef<Attempt | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
      controller.current = null;
    },
    [],
  );

  async function execute(attempt: Attempt) {
    const request = new AbortController();
    controller.current = request;
    pending.current = attempt;
    setCommand({ status: 'busy', message: t('Sending…'), place: attempt.place, accepted: false });
    try {
      const result = await api.post<CommandResult>(
        'commands',
        { commandId: attempt.commandId, command: attempt.command },
        request.signal,
      );
      if (!['accepted', 'duplicate', 'rejected'].includes(result.status)) throw new ApiError(0);
      if (request.signal.aborted) return;
      pending.current = null;
      setCommand({
        status: 'done',
        place: attempt.place,
        message: result.status === 'rejected' ? refusal(t, result.code) : attempt.success,
        accepted: result.status !== 'rejected',
      });
      onChanged();
    } catch (error) {
      if (request.signal.aborted) return;
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        pending.current = null;
        setCommand({
          status: 'done',
          place: attempt.place,
          message: t(error.message),
          accepted: false,
        });
        onChanged();
      } else {
        setCommand({
          status: 'uncertain',
          place: attempt.place,
          message: t(
            'The answer was interrupted. The change may have been made. Retry to check it.',
          ),
          accepted: false,
        });
      }
    }
  }

  return {
    lineage: resource,
    retryRead,
    command,
    busy: command.status === 'busy' || command.status === 'uncertain',
    run: (place, next, success) => {
      if (!isDm || pending.current) return;
      void execute({ place, command: next, success, commandId: `image-${crypto.randomUUID()}` });
    },
    retry: () => {
      if (pending.current) void execute(pending.current);
    },
  };
}
