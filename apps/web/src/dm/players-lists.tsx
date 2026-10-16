import type { EntityRef, InvitationView, MemberView } from '@ltw/contracts';
import { useLanguage, useT } from '@ltw/ui';
import { useEffect, useRef, useState } from 'react';

import { Glyph } from '../visual/glyph.tsx';
import { formatWhen, nameOf, splitInvitations } from './players.ts';
import type { Players } from './use-players.ts';

/**
 * The players at the table: each character with a player, whether that player is signed in
 * now, and revoking their access — asked first, since it signs them out at once on every
 * device; the character can then be invited again (docs/adr/0036-production-sign-in.md §4).
 */
export function MemberList({
  members,
  directory,
  players,
}: {
  readonly members: readonly MemberView[];
  readonly directory: readonly EntityRef[];
  readonly players: Players;
}) {
  const t = useT();
  return (
    <section className="tool-group players-members" aria-labelledby="players-members-title">
      <h3 id="players-members-title">
        <Glyph name="member" />
        {t('Players at the table')}
      </h3>
      {members.length === 0 ? (
        <p className="muted">{t('No player has joined yet.')}</p>
      ) : (
        <ul className="players-list">
          {members.map((member) => (
            <MemberRow
              key={member.characterId}
              member={member}
              name={nameOf(directory, member.characterId) ?? t('a character')}
              players={players}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function MemberRow({
  member,
  name,
  players,
}: {
  readonly member: MemberView;
  readonly name: string;
  readonly players: Players;
}) {
  const t = useT();
  const language = useLanguage();
  const [asking, setAsking] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const question = useRef<HTMLParagraphElement>(null);
  const asked = useRef(false);
  useEffect(() => {
    // The question takes focus when it opens; cancelling returns it to its button.
    if (asking) question.current?.focus();
    else if (asked.current) opener.current?.focus();
    asked.current = asking;
  }, [asking]);
  const signedIn = member.activeSessions > 0;
  const questionId = `revoke-${member.characterId}`;
  return (
    <li className="players-row">
      <div className="players-row-head">
        <Glyph name="character" className="players-row-glyph" />
        <strong>{name}</strong>
        <span className={`status-pill${signedIn ? ' players-pill--on' : ''}`}>
          {signedIn ? t('Signed in') : t('Not signed in')}
        </span>
      </div>
      <p className="players-when">
        {signedIn
          ? member.lastSeenAt === null
            ? t('Open sessions: {count}', { count: member.activeSessions })
            : t('Open sessions: {count} · last seen {when}', {
                count: member.activeSessions,
                when: formatWhen(member.lastSeenAt, language),
              })
          : t('To let this player back in, revoke their access and send a new invitation.')}
      </p>
      <div className="action-row">
        <button
          ref={opener}
          aria-label={t('Revoke access: {name}', { name })}
          aria-expanded={asking}
          aria-controls={questionId}
          disabled={players.working}
          onClick={() => {
            setAsking((value) => !value);
          }}
        >
          <Glyph name="revoke" />
          {t('Revoke access')}
        </button>
      </div>
      {asking && (
        <div
          id={questionId}
          className="players-confirm"
          role="group"
          aria-labelledby={`${questionId}-text`}
        >
          <p id={`${questionId}-text`} ref={question} tabIndex={-1}>
            {t(
              'Revoke the access of the player of {name}? They are signed out at once, on every device, and {name} can be invited again.',
              { name },
            )}
          </p>
          <div className="action-row">
            <button
              className="danger-button"
              disabled={players.working}
              onClick={() => {
                asked.current = false;
                setAsking(false);
                void players.revokeMember(member, name);
              }}
            >
              <Glyph name="revoke" />
              {t('Yes, revoke access')}
            </button>
            <button
              onClick={() => {
                setAsking(false);
              }}
            >
              {t('Cancel')}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * The invitations: those waiting to be used, each revocable, then the used, revoked and
 * expired ones folded away. Never a token: the listing holds none.
 */
export function InvitationList({
  invitations,
  directory,
  players,
}: {
  readonly invitations: readonly InvitationView[];
  readonly directory: readonly EntityRef[];
  readonly players: Players;
}) {
  const t = useT();
  const { open, earlier } = splitInvitations(invitations);
  const row = (invitation: InvitationView) => (
    <InvitationRow
      key={invitation.invitationId}
      invitation={invitation}
      name={
        invitation.purpose === 'dm' || invitation.characterId === null
          ? t('The DM (the operator’s link)')
          : (nameOf(directory, invitation.characterId) ?? t('a character'))
      }
      players={players}
    />
  );
  return (
    <section className="tool-group players-invitations" aria-labelledby="players-invitations-title">
      <h3 id="players-invitations-title">
        <Glyph name="invitation" />
        {t('Open invitations')}
      </h3>
      {open.length === 0 ? (
        <p className="muted">{t('No invitation is waiting to be used.')}</p>
      ) : (
        <ul className="players-list">{open.map(row)}</ul>
      )}
      {earlier.length > 0 && (
        <details className="players-earlier">
          <summary>{t('Used, revoked and expired: {count}', { count: earlier.length })}</summary>
          <ul className="players-list">{earlier.map(row)}</ul>
        </details>
      )}
    </section>
  );
}

function InvitationRow({
  invitation,
  name,
  players,
}: {
  readonly invitation: InvitationView;
  readonly name: string;
  readonly players: Players;
}) {
  const t = useT();
  const language = useLanguage();
  const when = (iso: string | null) => (iso === null ? '' : formatWhen(iso, language));
  const status =
    invitation.status === 'pending'
      ? t('Waiting to be used')
      : invitation.status === 'used'
        ? t('Used')
        : invitation.status === 'revoked'
          ? t('Revoked')
          : t('Expired');
  const detail =
    invitation.status === 'pending'
      ? t('Created {created} · expires {expires}', {
          created: when(invitation.createdAt),
          expires: when(invitation.expiresAt),
        })
      : invitation.status === 'used'
        ? t('Used {when}', { when: when(invitation.usedAt) })
        : invitation.status === 'revoked'
          ? t('Revoked {when}', { when: when(invitation.revokedAt) })
          : t('Expired {when}', { when: when(invitation.expiresAt) });
  return (
    <li className={`players-row players-row--${invitation.status}`}>
      <div className="players-row-head">
        <Glyph name="invitation" className="players-row-glyph" />
        <strong>{name}</strong>
        <span className="status-pill">{status}</span>
      </div>
      <p className="players-when">{detail}</p>
      {invitation.status === 'pending' && (
        <div className="action-row">
          <button
            aria-label={t('Revoke the invitation: {name}', { name })}
            disabled={players.working}
            onClick={() => {
              void players.revokeInvitation(invitation, name);
            }}
          >
            <Glyph name="revoke" />
            {t('Revoke the invitation')}
          </button>
        </div>
      )}
    </li>
  );
}
