import type {
  CreatedInvitationResponse,
  EntityRef,
  InvitationView,
  MemberView,
  RevokeInvitationResponse,
  RevokeMemberResponse,
} from '@ltw/contracts';
import type { Params } from '@ltw/ui';
import { useEffect, useRef, useState } from 'react';

import { ApiError, type WorldApi } from '../api/client.ts';

export interface PlayersNotice {
  readonly kind: 'error' | 'success';
  readonly text: string;
  readonly params?: Params;
}

/** Fixed words for each refusal; never the server's text. */
const REFUSED: Readonly<
  Record<'invite' | 'invitation' | 'member', Partial<Record<number, string>>>
> = {
  invite: {
    409: 'That character has a player now. The list has been read again.',
    404: 'That character is not in the campaign any more.',
    429: 'Too many invitations in the last hour. Try again later.',
  },
  invitation: {
    409: 'That invitation was used meanwhile.',
    404: 'That invitation no longer exists.',
  },
  member: { 404: 'That character is not in the campaign any more.' },
};

const LOST: Readonly<Record<'invite' | 'invitation' | 'member', string>> = {
  // A lost answer may have created an invitation whose link nobody saw: it can be revoked.
  invite:
    'The answer was lost on the way. If the list shows a new invitation, revoke it and create another.',
  invitation: 'The answer was lost on the way. The list has been read again to show what happened.',
  member: 'The answer was lost on the way. The list has been read again to show what happened.',
};

function failure(action: 'invite' | 'invitation' | 'member', error: unknown): string {
  if (!(error instanceof ApiError) || error.status === 0) return LOST[action];
  return REFUSED[action][error.status] ?? error.message;
}

/**
 * The DM's invitations and members (docs/adr/0036-production-sign-in.md §4) through the DM-only
 * routes: invite a player for a free character, revoke an invitation, revoke a member. One
 * action at a time; after each the listing is read again (`round`), so what the sheet shows is
 * the server's. A new link is held here only, shown once, and dropped when it is hidden,
 * revoked, used or replaced: the server never shows it again.
 */
export function usePlayers(api: WorldApi, onWorldChanged: () => void) {
  const [created, setCreated] = useState<CreatedInvitationResponse | null>(null);
  const [notice, setNotice] = useState<PlayersNotice | null>(null);
  const [working, setWorking] = useState(false);
  const [round, setRound] = useState(0);
  const inFlight = useRef(false);
  const live = useRef(true);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      controller.current?.abort();
    };
  }, []);

  async function act<T>(
    action: 'invite' | 'invitation' | 'member',
    work: (signal: AbortSignal) => Promise<T>,
    done: (result: T) => void,
  ): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    const request = new AbortController();
    controller.current = request;
    setWorking(true);
    setNotice(null);
    try {
      const result = await work(request.signal);
      if (live.current) done(result);
    } catch (error) {
      if (live.current) setNotice({ kind: 'error', text: failure(action, error) });
    } finally {
      inFlight.current = false;
      if (live.current) {
        setWorking(false);
        setRound((value) => value + 1);
      }
    }
  }

  return {
    created,
    notice,
    working,
    /** Grows after every action: the listing reads again. */
    round,
    invite: (character: EntityRef, expiresHours: number) =>
      act(
        'invite',
        (signal) =>
          api.post<CreatedInvitationResponse>(
            'invitations',
            { characterId: character.entityId, expiresHours },
            signal,
          ),
        (invitation) => {
          setCreated(invitation);
        },
      ),
    revokeInvitation: (invitation: InvitationView, name: string) =>
      act(
        'invitation',
        (signal) =>
          api.post<RevokeInvitationResponse>(
            `invitations/${encodeURIComponent(invitation.invitationId)}/revoke`,
            {},
            signal,
          ),
        () => {
          setCreated((shown) => (shown?.invitationId === invitation.invitationId ? null : shown));
          setNotice({
            kind: 'success',
            text: 'The invitation for {name} is revoked: its link no longer works.',
            params: { name },
          });
        },
      ),
    revokeMember: (member: MemberView, name: string) =>
      act(
        'member',
        (signal) =>
          api.post<RevokeMemberResponse | { readonly status: string }>(
            `members/${encodeURIComponent(member.characterId)}/revoke`,
            {},
            signal,
          ),
        (result) => {
          // The player's sessions end first; the World Engine then frees the seat, or refuses.
          setCreated((shown) => (shown?.characterId === member.characterId ? null : shown));
          setNotice(
            'released' in result
              ? {
                  kind: 'success',
                  text: 'The player of {name} is signed out, and {name} can be invited again.',
                  params: { name },
                }
              : {
                  kind: 'error',
                  text: 'The player of {name} is signed out, but the seat could not be freed. Try again.',
                  params: { name },
                },
          );
          onWorldChanged();
        },
      ),
    /** The listing shows the shown link's invitation settled: its link is dropped. */
    settled: (invitation: InvitationView, name: string) => {
      setCreated((shown) => (shown?.invitationId === invitation.invitationId ? null : shown));
      if (invitation.status === 'used') {
        setNotice({
          kind: 'success',
          text: 'The invitation for {name} was used: the player has joined.',
          params: { name },
        });
      }
    },
    hide: () => {
      setCreated(null);
    },
  };
}

export type Players = ReturnType<typeof usePlayers>;
