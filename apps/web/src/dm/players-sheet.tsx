import {
  DEFAULT_INVITATION_HOURS,
  MAX_INVITATION_HOURS,
  type CreatedInvitationResponse,
  type EntityRef,
  type MembershipResponse,
} from '@ltw/contracts';
import { StatusPanel, useLanguage, useT } from '@ltw/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { Glyph } from '../visual/glyph.tsx';
import { useRereadOn } from '../world/use-world-data.ts';
import { formatWhen, freeCharacters, nameOf } from './players.ts';
import { InvitationList, MemberList } from './players-lists.tsx';
import { usePlayers, type Players } from './use-players.ts';

/** How long a new link lasts: one day, the default three, or the longest a link may last. */
const EXPIRY_HOURS = [24, DEFAULT_INVITATION_HOURS, MAX_INVITATION_HOURS] as const;

/**
 * The DM's Players sheet (docs/adr/0036-production-sign-in.md §4; docs/STAGE_340_DESIGN.md
 * "Flows"), with production sign-in only: invite a player for a character nobody plays (the
 * link shown once, with a copy button), the open and earlier invitations, the players at the
 * table, and revoking either. Never a token in a listing; never a player's actor ID. The
 * listing is read while the sheet is open and follows the live signal; what is being written
 * (the choice, the new link, a question) stays while the sheet is closed.
 */
export function PlayersSheet({
  api,
  open,
  directory,
  onWorldChanged,
}: {
  readonly api: WorldApi;
  readonly open: boolean;
  readonly directory: readonly EntityRef[];
  readonly onWorldChanged: () => void;
}) {
  const t = useT();
  const players = usePlayers(api, onWorldChanged);
  const { notice, created } = players;
  const [characterId, setCharacterId] = useState('');
  const [hours, setHours] = useState<number>(DEFAULT_INVITATION_HOURS);
  return (
    <div className="players">
      {notice && (
        <p
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`authoring-notice ${notice.kind}`}
        >
          {t(notice.text, notice.params)}
        </p>
      )}
      {created && (
        <CreatedLink
          created={created}
          name={nameOf(directory, created.characterId) ?? t('a character')}
          onHide={players.hide}
        />
      )}
      {open && (
        <Membership
          api={api}
          directory={directory}
          players={players}
          characterId={characterId}
          onCharacter={setCharacterId}
          hours={hours}
          onHours={setHours}
        />
      )}
    </div>
  );
}

function Membership({
  api,
  directory,
  players,
  characterId,
  onCharacter,
  hours,
  onHours,
}: {
  readonly api: WorldApi;
  readonly directory: readonly EntityRef[];
  readonly players: Players;
  readonly characterId: string;
  readonly onCharacter: (characterId: string) => void;
  readonly hours: number;
  readonly onHours: (hours: number) => void;
}) {
  const t = useT();
  const load = useCallback(
    (signal: AbortSignal) => api.get<MembershipResponse>('invitations', signal, false),
    [api],
  );
  const { resource, retry, reread } = useResource('players', load);
  useRereadOn(players.round, reread);
  const listing = resource.status === 'ready' ? resource.value : null;
  // The shown link's invitation, once used, revoked or expired, is no use to anyone.
  const shown = players.created;
  const settled = listing?.invitations.find(
    (invitation) =>
      invitation.invitationId === shown?.invitationId && invitation.status !== 'pending',
  );
  useEffect(() => {
    if (settled && shown) {
      players.settled(settled, nameOf(directory, shown.characterId) ?? t('a character'));
    }
  }, [settled]);
  if (!listing) {
    return (
      <StatusPanel
        state={resource.status === 'error' ? 'error' : 'loading'}
        label={resource.status === 'error' ? resource.message : t('Reading the players…')}
        onRetry={retry}
      />
    );
  }
  const free = freeCharacters(directory, listing.members);
  const chosen = free.find((character) => character.entityId === characterId) ?? free[0];
  return (
    <div className="players-grid">
      <section className="tool-group players-invite" aria-labelledby="players-invite-title">
        <h3 id="players-invite-title">
          <Glyph name="invitation" />
          {t('Invite a player')}
        </h3>
        <p className="muted">
          {t('An invitation link seats one player as a character nobody plays yet. It works once.')}
        </p>
        {chosen === undefined ? (
          <p className="muted">
            {t('Every character has a player. Revoke a player’s access to free a character.')}
          </p>
        ) : (
          <form
            className="players-form"
            onSubmit={(event) => {
              event.preventDefault();
              void players.invite(chosen, hours);
            }}
          >
            <div className="field">
              <label htmlFor="invite-character">{t('Character')}</label>
              <select
                id="invite-character"
                value={chosen.entityId}
                onChange={(event) => {
                  onCharacter(event.target.value);
                }}
              >
                {free.map((character) => (
                  <option key={character.entityId} value={character.entityId}>
                    {character.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="invite-expiry">{t('The link expires after')}</label>
              <select
                id="invite-expiry"
                value={hours}
                onChange={(event) => {
                  onHours(Number(event.target.value));
                }}
              >
                {EXPIRY_HOURS.map((choice) => (
                  <option key={choice} value={choice}>
                    {choice === 24 ? t('1 day') : choice === 168 ? t('7 days') : t('3 days')}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="primary-button" disabled={players.working}>
              <Glyph name="link" />
              {t('Create invitation link')}
            </button>
          </form>
        )}
      </section>
      <MemberList members={listing.members} directory={directory} players={players} />
      <InvitationList invitations={listing.invitations} directory={directory} players={players} />
    </div>
  );
}

/**
 * The new link, shown this once (the server keeps only its hash): copy it, or select it to copy
 * by hand where the clipboard is unavailable.
 */
function CreatedLink({
  created,
  name,
  onHide,
}: {
  readonly created: CreatedInvitationResponse;
  readonly name: string;
  readonly onHide: () => void;
}) {
  const t = useT();
  const language = useLanguage();
  const field = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState<'copied' | 'select' | null>(null);
  useEffect(() => {
    setCopied(null);
  }, [created]);
  const copy = () => {
    const select = () => {
      field.current?.focus();
      field.current?.select();
      setCopied('select');
    };
    if (typeof navigator.clipboard === 'undefined') {
      select();
      return;
    }
    navigator.clipboard.writeText(created.link).then(() => {
      setCopied('copied');
    }, select);
  };
  return (
    <section className="players-link" aria-labelledby="players-link-title">
      <h3 id="players-link-title">
        <Glyph name="link" />
        {t('Invitation link for {name}', { name })}
      </h3>
      <p className="players-once">
        <Glyph name="hidden" />
        <span>
          <strong>{t('Shown only once.')}</strong>{' '}
          {t(
            'Copy it now and send it to the player privately: whoever opens it first takes the seat of {name}.',
            { name },
          )}
        </span>
      </p>
      <label htmlFor="invitation-link">{t('Invitation link')}</label>
      <div className="players-link-row">
        <input
          id="invitation-link"
          ref={field}
          readOnly
          value={created.link}
          spellCheck={false}
          autoComplete="off"
          onFocus={(event) => {
            event.currentTarget.select();
          }}
        />
        <button onClick={copy}>
          <Glyph name="copy" />
          {t('Copy link')}
        </button>
      </div>
      <p role="status" className="players-copied">
        {copied === 'copied'
          ? t('Copied. Paste it into a private message to the player.')
          : copied === 'select'
            ? t('The link is selected: copy it with your keyboard.')
            : ''}
      </p>
      <p className="muted">
        {t('It expires {when}. Until then you can revoke it below.', {
          when: formatWhen(created.expiresAt, language),
        })}
      </p>
      <button className="quiet-button" onClick={onHide}>
        {t('Hide the link')}
      </button>
    </section>
  );
}
