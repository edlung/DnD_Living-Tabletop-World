import type { AssetLineageResponse, CommandResult } from '@ltw/contracts';
import { useT, type Translate } from '@ltw/ui';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { ApiError, type WorldApi } from '../api/client.ts';
import { useResource, type Resource } from '../api/resource.ts';
import { rejectionMessage } from '../exploration/outcome-messages.ts';
import { useRereadOn } from '../world/use-world-data.ts';
import {
  answered,
  IDLE,
  interrupted,
  isBusy,
  lineageRead,
  retried,
  sent,
  type ImageAction,
  type ImageCommandState,
} from './command-state.ts';

/**
 * The DM's image controls (docs/STAGE_330_DESIGN.md "DM controls"): the campaign's asset lineage,
 * read in the DM perspective only (`GET …/assets`, never for a lower perspective), and the DM's
 * image commands — request, approve, discard — sent one at a time through the existing command
 * route (`command-state.ts`). The lineage re-reads after each own command and on every live
 * signal (the DM's coverage includes it), so a job is followed from the request to its candidate
 * as the asset worker reports it, and nothing is ever shown that the server did not say. A
 * command's controls come back only once the lineage read after its answer shows what it did.
 */
export interface DmImages {
  readonly lineage: Resource<AssetLineageResponse | null>;
  readonly retryRead: () => void;
  readonly command: ImageCommandState;
  /** A command is in flight, its answer was lost, or the list does not show its result yet. */
  readonly busy: boolean;
  /** Sends one command, unless another is still pending. */
  readonly run: (action: ImageAction) => void;
  /**
   * Sends the uncertain command again (the same command ID, so never twice); its result then
   * shows at `place`, where the DM pressed Retry.
   */
  readonly retry: (place: string) => void;
}

/** Present only in the DM perspective: a lower perspective has no image controls at all. */
export const DmImagesContext = createContext<DmImages | null>(null);

export const useDmImages = (): DmImages | null => useContext(DmImagesContext);

/** While a result waits for the lineage, it is read again this often: a failed read never holds the controls. */
export const SETTLE_REREAD_MS = 2_000;

interface Attempt {
  readonly action: ImageAction;
  readonly commandId: string;
}

/** A lineage read, numbered in the order reads started. */
interface LineageRead {
  readonly lineage: AssetLineageResponse;
  readonly read: number;
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
  const reads = useRef(0);
  const load = useCallback(
    async (signal: AbortSignal): Promise<LineageRead | null> => {
      if (!isDm) return null;
      reads.current += 1;
      const read = reads.current;
      return { lineage: await api.get<AssetLineageResponse>('assets', signal, false), read };
    },
    [api, isDm],
  );
  const { resource, retry: retryRead, reread } = useResource('asset-lineage', load);
  useRereadOn(revision, reread);
  const lineage = useMemo<Resource<AssetLineageResponse | null>>(
    () =>
      resource.status === 'ready'
        ? { status: 'ready', value: resource.value?.lineage ?? null }
        : resource,
    [resource],
  );

  // The state is mirrored in a ref, so a second press in the same moment is refused at once.
  const state = useRef<ImageCommandState>(IDLE);
  const [command, setCommand] = useState<ImageCommandState>(IDLE);
  const move = (next: ImageCommandState) => {
    state.current = next;
    setCommand(next);
  };
  /** The command in flight or unanswered, with its client command ID kept for Retry. */
  const pending = useRef<Attempt | null>(null);
  /** The answered command whose result waits for the lineage. */
  const settling = useRef<ImageAction | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
      controller.current = null;
    },
    [],
  );

  // The first lineage read started after the answer shows its result: then the command is done.
  const shown = resource.status === 'ready' ? resource.value : null;
  useEffect(() => {
    const action = settling.current;
    if (!shown || !action) return;
    const next = lineageRead(state.current, shown.read, shown.lineage, action.success);
    if (next === state.current) return;
    settling.current = null;
    move(next);
  }, [shown]);
  const latestReread = useRef(reread);
  latestReread.current = reread;
  useEffect(() => {
    if (command.status !== 'settling') return;
    const timer = setInterval(() => {
      latestReread.current();
    }, SETTLE_REREAD_MS);
    return () => {
      clearInterval(timer);
    };
  }, [command.status, command.id]);

  const answer = (attempt: Attempt, refused: string | null) => {
    pending.current = null;
    settling.current = attempt.action;
    move(answered(state.current, { refusal: refused }, reads.current));
    onChanged();
  };

  async function execute(attempt: Attempt) {
    const request = new AbortController();
    controller.current = request;
    pending.current = attempt;
    try {
      const result = await api.post<CommandResult>(
        'commands',
        { commandId: attempt.commandId, command: attempt.action.command },
        request.signal,
      );
      if (!['accepted', 'duplicate', 'rejected'].includes(result.status)) throw new ApiError(0);
      if (request.signal.aborted) return;
      answer(attempt, result.status === 'rejected' ? refusal(t, result.code) : null);
    } catch (error) {
      if (request.signal.aborted) return;
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        answer(attempt, t(error.message));
      } else {
        move(interrupted(state.current));
      }
    }
  }

  return {
    lineage,
    retryRead,
    command,
    busy: isBusy(command),
    run: (action) => {
      if (!isDm || isBusy(state.current)) return;
      move(sent(state.current, action));
      void execute({ action, commandId: `image-${crypto.randomUUID()}` });
    },
    retry: (place) => {
      const attempt = pending.current;
      if (!attempt || state.current.status !== 'uncertain') return;
      move(retried(state.current, place));
      void execute(attempt);
    },
  };
}
