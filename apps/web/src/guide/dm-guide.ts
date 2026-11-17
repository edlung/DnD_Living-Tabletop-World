import type { Translate } from '@ltw/ui';

import type { GuidePage } from './guide.tsx';

/**
 * "How to run the game" (docs/adr/0071-memory-and-ritual.md §4): the DM's pages of the guide —
 * before the evening, the first meeting, opening, running, the table's screen, closing, and when
 * something goes wrong. Static words that name the screens as they are; nothing of the world.
 */
export function dmPagesOf(t: Translate): readonly GuidePage[] {
  return [
    {
      glyph: 'chapter',
      title: t('Before the evening'),
      lines: [
        t(
          'You run the game from a laptop or an iPad; the players hold their characters on phones.',
        ),
        t('In Players, make an invitation for each character and send each player their link.'),
        t(
          'In Session, write the table’s agreement — the tone, what is not in this game, the sign for a pause — and set the day of the next game.',
        ),
      ],
    },
    {
      glyph: 'party',
      title: t('The first meeting'),
      lines: [
        t('Pair the TV in Table screen: the TV shows a code, you type it.'),
        t(
          'Show the agreement on the table’s screens and read it aloud. Everyone says “Understood” on their own screen; for a child without one, press “Said it aloud” in Session.',
        ),
        t('Let everyone open “How to play” once: a few short pages.'),
      ],
    },
    {
      glyph: 'live',
      title: t('Opening the evening'),
      lines: [
        t('In Session, choose where you play — at the table or online — and start the session.'),
        t(
          'From the second evening, open with “Previously…”: the table’s screens show last time’s chapter, and you read it aloud.',
        ),
      ],
    },
    {
      glyph: 'initiative',
      title: t('During the game'),
      lines: [
        t(
          'Players act from their phones and the world answers by the rules. What the rules do not decide is yours: ask for a check in Party, start a fight in Encounter.',
        ),
        t(
          'Pause the game in Session whenever the table needs a break. When a player asks for a pause, a card appears on your screen and nowhere else — pause without saying who asked.',
        ),
        t('A step went wrong? History shows what happened and undoes what the world allows.'),
      ],
    },
    {
      glyph: 'picture',
      title: t('The table’s screen'),
      lines: [
        t(
          'The TV shows only what the whole party knows: a scene, the battlefield, a picture, the Chronicle. Your secrets never go there.',
        ),
        t('You choose what it shows in Table screen; online, every player sees the same.'),
      ],
    },
    {
      glyph: 'chronicle',
      title: t('Closing the evening'),
      lines: [
        t(
          'End the session and keep “Write a chapter” ticked: the evening becomes a page of the Chronicle and next time’s “Previously…”.',
        ),
        t(
          'Everyone names a star — what they liked — and a wish for next time. Wishes come only to you: read them before you prepare.',
        ),
        t('Set the next game before everyone leaves.'),
      ],
    },
    {
      glyph: 'ask',
      title: t('When something goes wrong'),
      lines: [
        t(
          'A scene upsets someone: pause, say plainly what happens next instead, and go on. Nobody has to explain why.',
        ),
        t('A rule is unclear: decide now, say so, and look it up in Rules after the game.'),
        t(
          'A screen fell behind: press Refresh world. A player cannot get in from their phone: make a new invitation in Players.',
        ),
      ],
    },
  ];
}
