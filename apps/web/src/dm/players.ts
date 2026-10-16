import type { EntityRef, InvitationView, MemberView } from '@ltw/contracts';
import type { Language } from '@ltw/ui';

/**
 * What the DM's Players sheet shows (docs/adr/0036-production-sign-in.md §4), from the
 * server's listing and the DM's own directory: which characters can be offered, the open
 * invitations apart from the rest, and real-world times in the reader's language and zone.
 */

/** Characters nobody plays yet, by name: the seats an invitation can offer. */
export function freeCharacters(
  directory: readonly EntityRef[],
  members: readonly MemberView[],
): EntityRef[] {
  const seated = new Set(members.map((member) => member.characterId));
  return directory
    .filter((entity) => entity.kind === 'character' && !seated.has(entity.entityId))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** A character's name from the DM's directory, or null when it is not there. */
export const nameOf = (directory: readonly EntityRef[], characterId: string): string | null =>
  directory.find((entity) => entity.entityId === characterId)?.name ?? null;

/** Invitations still waiting to be used, then every other one, each in the listing's order. */
export function splitInvitations(invitations: readonly InvitationView[]): {
  readonly open: readonly InvitationView[];
  readonly earlier: readonly InvitationView[];
} {
  return {
    open: invitations.filter((invitation) => invitation.status === 'pending'),
    earlier: invitations.filter((invitation) => invitation.status !== 'pending'),
  };
}

/** A real-world moment, in the reader's language (and time zone unless one is given). */
export function formatWhen(iso: string, language: Language, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(date);
}
