import {
  DEFAULT_INVITATION_HOURS,
  MAX_INVITATION_HOURS,
  type EntityRef,
  type MembershipResponse,
} from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useCallback, useEffect, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { Glyph } from '../visual/glyph.tsx';
import { useRereadOn } from '../world/use-world-data.ts';
import { freeCharacters, nameOf } from './players.ts';
import { InvitationList, MemberList } from './players-lists.tsx';
import { ShownLink } from './shown-link.tsx';
import { usePlayers, type Players } from './use-players.ts';

/** How long a new link lasts: one day, the default three, or the longest a link may last. */
const EXPIRY_HOURS = [24, DEFAULT_INVITATION_HOURS, MAX_INVITATION_HOURS] as const;

/**
 * The DM's Players sheet (docs/adr/0036-production-sign-in.md §4; docs/STAGE_340_DESIGN.md
 * "Flows"), with production sign-in only: invite a player for a character nobody plays (the
 * link shown once, with a copy button and a QR code), the open and earlier invitations, the
 * players at the table with their logins, a password reset link, and revoking either. Never a token in a listing; never a player's actor ID. The
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
        <InvitationLink
          link={created.link}
          expiresAt={created.expiresAt}
          name={nameOf(directory, created.characterId) ?? t('a character')}
          onHide={players.hide}
        />
      )}
      {players.reset && (
        <ResetLink
          link={players.reset.link}
          expiresAt={players.reset.expiresAt}
          name={nameOf(directory, players.reset.characterId) ?? t('a character')}
          onHide={players.hideReset}
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

function InvitationLink({
  link,
  expiresAt,
  name,
  onHide,
}: {
  readonly link: string;
  readonly expiresAt: string;
  readonly name: string;
  readonly onHide: () => void;
}) {
  const t = useT();
  return (
    <ShownLink
      link={link}
      expiresAt={expiresAt}
      title={t('Invitation link for {name}', { name })}
      once={t(
        'Copy it now and send it to the player privately: whoever opens it first takes the seat of {name}.',
        { name },
      )}
      label={t('Invitation link')}
      qrLabel={t('QR code of the invitation link for {name}', { name })}
      copied={t('Copied. Paste it into a private message to the player.')}
      revocable
      onHide={onHide}
    />
  );
}

function ResetLink({
  link,
  expiresAt,
  name,
  onHide,
}: {
  readonly link: string;
  readonly expiresAt: string;
  readonly name: string;
  readonly onHide: () => void;
}) {
  const t = useT();
  return (
    <ShownLink
      link={link}
      expiresAt={expiresAt}
      title={t('Password reset link for {name}', { name })}
      once={t(
        'Give it to the player of {name} only: it sets a new password for their login, once.',
        { name },
      )}
      label={t('Password reset link')}
      qrLabel={t('QR code of the password reset link for {name}', { name })}
      copied={t('Copied. Give it to the player privately.')}
      revocable={false}
      onHide={onHide}
    />
  );
}
