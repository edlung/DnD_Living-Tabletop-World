import type { Language } from '@ltw/contracts';

/** The names of the views a session may take (ADR 0031); the client shows them as given. */
export interface SessionText {
  player(character: string): string;
  readonly dungeonMaster: string;
  readonly party: string;
  readonly publicView: string;
}

const en: SessionText = {
  player: (character) => `Player · ${character}`,
  dungeonMaster: 'Dungeon Master',
  party: 'Party',
  publicView: 'Public',
};

const ru: SessionText = {
  player: (character) => `Игрок · ${character}`,
  dungeonMaster: 'Мастер',
  party: 'Отряд',
  publicView: 'Публичный вид',
};

export const sessionText = (language: Language): SessionText => (language === 'ru' ? ru : en);
