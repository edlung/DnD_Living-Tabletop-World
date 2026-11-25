import type { AccountCampaign, CampaignLibraryEntry } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { currentFirst, currentOf, inView, shelvesOf } from './shelf-order.ts';

const campaign = (
  campaignId: string,
  evening: NonNullable<AccountCampaign['evening']> | null,
  more: Partial<AccountCampaign> = {},
): AccountCampaign => ({
  campaignId,
  name: campaignId,
  role: 'dm',
  language: 'ru',
  characters: [],
  away: null,
  nextGame: null,
  chapters: 0,
  place: null,
  finished: null,
  evening,
  ...more,
});

const book = (id: string, audience: string): CampaignLibraryEntry => ({
  id,
  title: id,
  genre: 'genre',
  audience,
  pitch: 'pitch',
  tone: '',
  duration: '',
  pictures: 0,
  defaultVariant: 'four',
  variants: [{ id: 'four', players: 4, label: 'four' }],
});

describe('the book the shelf goes on with', () => {
  it('is the one whose last evening is the latest, running or ended', () => {
    expect(
      currentOf([
        campaign('left-open', { at: '2026-11-10T18:00:00.000Z', running: true }),
        campaign('last-night', { at: '2026-11-24T21:00:00.000Z', running: false }),
        campaign('never', null),
      ]),
    ).toBe('last-night');
    expect(
      currentOf([
        campaign('ended', { at: '2026-11-21T21:00:00.000Z', running: false }),
        campaign('tonight', { at: '2026-11-25T18:00:00.000Z', running: true }),
      ]),
    ).toBe('tonight');
  });

  it('keeps the first of two with the same instant', () => {
    expect(
      currentOf([
        campaign('one', { at: '2026-11-24T21:00:00.000Z', running: false }),
        campaign('two', { at: '2026-11-24T21:00:00.000Z', running: true }),
      ]),
    ).toBe('one');
  });

  it('is none before any evening, and on a server from before the shelf told of evenings', () => {
    expect(currentOf([campaign('new', null)])).toBeNull();
    const old: AccountCampaign = { ...campaign('old', null) };
    delete (old as { evening?: unknown }).evening;
    expect(currentOf([old])).toBeNull();
    expect(currentOf([])).toBeNull();
  });

  it('is never a campaign played on another server, nor one with a time that is no time', () => {
    expect(
      currentOf([
        campaign(
          'moved',
          { at: '2026-11-24T21:00:00.000Z', running: true },
          { away: { destination: 'MacBook', movedAt: '2026-11-24T22:00:00.000Z' } },
        ),
        campaign('broken', { at: 'soon', running: true }),
        campaign('here', { at: '2026-11-01T21:00:00.000Z', running: false }),
      ]),
    ).toBe('here');
  });

  it('stands first, the others in their order', () => {
    const played = [campaign('a', null), campaign('b', null), campaign('c', null)];
    expect(currentFirst(played, 'c').map((one) => one.campaignId)).toEqual(['c', 'a', 'b']);
    expect(currentFirst(played, null)).toBe(played);
  });
});

describe('the library on shelves by age', () => {
  it('puts the youngest first and keeps the library’s order on a shelf', () => {
    const shelves = shelvesOf([
      book('noir', '21+'),
      book('tale', '8+'),
      book('quest', '12+'),
      book('fair', '8+'),
    ]);
    expect(shelves.map((shelf) => shelf.audience)).toEqual(['8+', '12+', '21+']);
    expect(shelves[0]?.books.map((one) => one.id)).toEqual(['tale', 'fair']);
  });

  it('shows one row of a shelf', () => {
    expect(inView(5)).toBe(5);
    expect(inView(2)).toBe(2);
    expect(inView(2.9)).toBe(2);
    expect(inView(0)).toBe(1);
  });
});
