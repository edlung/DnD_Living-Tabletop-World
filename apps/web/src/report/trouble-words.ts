import type { ClientErrorView } from '@ltw/contracts';
import type { Translate } from '@ltw/ui';

/**
 * The DM's words for a client error report (docs/adr/0073-table-ideas.md §1): every field is one
 * of a fixed few, so every word here is the application's own — a report cannot put a word of its
 * own on the DM's screen.
 */
const WHOSE: Readonly<Record<ClientErrorView['role'], string>> = {
  player: 'A player’s screen',
  dm: 'Your screen',
  display: 'The table’s display',
};

const BROWSERS: Readonly<Record<ClientErrorView['browser'], string>> = {
  chrome: 'Chrome',
  safari: 'Safari',
  firefox: 'Firefox',
  edge: 'Edge',
  samsung: 'Samsung Internet',
  opera: 'Opera',
  other: 'Another browser',
};

const SYSTEMS: Readonly<Record<ClientErrorView['system'], string>> = {
  ios: 'an iPhone or iPad',
  android: 'an Android device',
  windows: 'a Windows computer',
  macos: 'a Mac',
  linux: 'a Linux computer',
  chromeos: 'a Chromebook',
  other: 'another device',
};

const PAGES: Readonly<Record<Exclude<ClientErrorView['page'], 'game'>, string>> = {
  campaigns: 'Your campaigns',
  'sign-in': 'Signing in',
  display: 'The table’s display',
  workshop: 'The workshop',
  privacy: 'Privacy notice',
};

/** The game's parts by the words their own buttons wear. */
const PARTS: Readonly<Record<ClientErrorView['part'], string>> = {
  none: 'The game',
  places: 'Places',
  journal: 'Journal',
  dice: 'Dice',
  add: 'Add to the world',
  encounter: 'Encounter',
  time: 'Time and weather',
  history: 'History',
  images: 'Images',
  players: 'Players',
  screen: 'Table screen',
  party: 'Party',
  notes: 'Notes',
  session: 'Session',
  chat: 'Chat',
  shared: 'Table screen',
  rules: 'Rules',
  chronicle: 'Chronicle',
  hero: 'Character',
  book: 'Book',
  appendix: 'Appendix',
  settings: 'Settings',
};

const KINDS: Readonly<Record<ClientErrorView['kind'], string>> = {
  render: 'The screen could not be shown',
  error: 'An error in the page',
  rejection: 'An action did not finish',
};

export const whoseWords = (t: Translate, error: ClientErrorView): string => t(WHOSE[error.role]);

export const whereWords = (t: Translate, error: ClientErrorView): string =>
  t(error.page === 'game' ? PARTS[error.part] : PAGES[error.page]);

export const kindWords = (t: Translate, error: ClientErrorView): string => t(KINDS[error.kind]);

/** "Safari 18 on an iPhone or iPad", with "in the app" inside a native shell. */
export function browserWords(t: Translate, error: ClientErrorView): string {
  const browser = t(BROWSERS[error.browser]);
  const named = error.browserVersion > 0 ? `${browser} ${String(error.browserVersion)}` : browser;
  const device = t('{browser} on {device}', { browser: named, device: t(SYSTEMS[error.system]) });
  return error.shell === 'none' ? device : t('{device}, in the app', { device });
}

/** The place in the program's own code, for whoever maintains the server: code, not words. */
export const placeWords = (error: ClientErrorView): string =>
  error.place
    .map((frame) => `${frame.file}:${String(frame.line)}:${String(frame.column)}`)
    .join(' ← ');
