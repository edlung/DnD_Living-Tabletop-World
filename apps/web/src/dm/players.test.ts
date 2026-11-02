import type { EntityRef, InvitationView } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { formatWhen, freeCharacters, nameOf, splitInvitations } from './players.ts';

const entity = (entityId: string, kind: EntityRef['kind'], name: string): EntityRef => ({
  entityId,
  kind,
  name,
});
const DIRECTORY = [
  entity('seren-ashgrove', 'character', 'Seren Ashgrove'),
  entity('mira-vale', 'npc', 'Mira Vale'),
  entity('elowen-starwhisper', 'character', 'Elowen Starwhisper'),
  entity('market-square', 'location', 'Market Square'),
  entity('bram-holt', 'character', 'Bram Holt'),
];

const invitation = (invitationId: string, status: InvitationView['status']): InvitationView => ({
  invitationId,
  purpose: 'player',
  characterId: 'elowen-starwhisper',
  status,
  createdAt: '2026-10-16T08:00:00.000Z',
  expiresAt: '2026-10-19T08:00:00.000Z',
  usedAt: status === 'used' ? '2026-10-16T09:00:00.000Z' : null,
  revokedAt: status === 'revoked' ? '2026-10-16T09:30:00.000Z' : null,
});

describe('the Players sheet', () => {
  it('offers only characters nobody plays, never NPCs or places, by name', () => {
    const members = [
      { characterId: 'elowen-starwhisper', activeSessions: 1, lastSeenAt: null, login: null },
    ];
    expect(freeCharacters(DIRECTORY, members).map((character) => character.name)).toEqual([
      'Bram Holt',
      'Seren Ashgrove',
    ]);
    expect(freeCharacters(DIRECTORY, [])).toHaveLength(3);
  });

  it('names characters from the directory, and nothing it does not hold', () => {
    expect(nameOf(DIRECTORY, 'seren-ashgrove')).toBe('Seren Ashgrove');
    expect(nameOf(DIRECTORY, 'someone-else')).toBeNull();
  });

  it('lists the invitations waiting to be used apart from the rest, keeping their order', () => {
    const { open, earlier } = splitInvitations([
      invitation('a', 'pending'),
      invitation('b', 'used'),
      invitation('c', 'pending'),
      invitation('d', 'expired'),
      invitation('e', 'revoked'),
    ]);
    expect(open.map((item) => item.invitationId)).toEqual(['a', 'c']);
    expect(earlier.map((item) => item.invitationId)).toEqual(['b', 'd', 'e']);
  });

  it('writes real-world times in the reader’s language', () => {
    const at = '2026-10-16T14:05:00.000Z';
    expect(formatWhen(at, 'en', 'UTC')).toBe('16 Oct 2026, 14:05');
    expect(formatWhen(at, 'ru', 'UTC')).toMatch(/^16 окт\. 2026( г\.)?, 14:05$/);
    expect(formatWhen('not a time', 'en')).toBe('');
  });
});
