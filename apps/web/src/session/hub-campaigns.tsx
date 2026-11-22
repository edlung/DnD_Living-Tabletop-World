import { campaignAppearance } from '../visual/campaign-themes/index.ts';
import type { AccountCampaign } from '@ltw/contracts';
import { useLanguage, useT } from '@ltw/ui';
import { useId } from 'react';

import { nativeShell } from '../native/shell.ts';
import { keptWords } from '../ritual/ending.ts';
import { readerLocale } from '../ritual/next-game-words.ts';
import { calendarHref, NextGameLine } from '../ritual/next-game.tsx';
import { Glyph } from '../visual/glyph.tsx';

/**
 * The account's campaigns as its hub lists them (docs/adr/0041-accounts.md): those being played,
 * each with its door and — once the party's story has a chapter — its book (ADR 0072 §1); and,
 * apart, the adventures that are finished (§2): the days they were played, their heroes, what
 * each hero keeps, the book first and the door after it.
 */
export function CampaignLists({
  campaigns,
  busy,
  onOpen,
  onBook,
}: {
  readonly campaigns: readonly AccountCampaign[];
  /** What is opening: a campaign's ID, or that ID and ":book"; null when nothing is. */
  readonly busy: string | null;
  readonly onOpen: (campaignId: string) => void;
  readonly onBook: (campaignId: string) => void;
}) {
  const t = useT();
  // A server from before endings sends none.
  const over = (campaign: AccountCampaign) => (campaign.finished ?? null) !== null;
  const played = campaigns.filter((campaign) => !over(campaign));
  const finished = campaigns.filter(over);
  const card = (campaign: AccountCampaign) => (
    <CampaignCard
      key={campaign.campaignId}
      campaign={campaign}
      busy={busy !== null}
      opening={
        busy === campaign.campaignId
          ? 'world'
          : busy === `${campaign.campaignId}:book`
            ? 'book'
            : null
      }
      onOpen={() => {
        onOpen(campaign.campaignId);
      }}
      onBook={() => {
        onBook(campaign.campaignId);
      }}
    />
  );
  return (
    <>
      {played.length > 0 && (
        <ul className="hub-campaigns" aria-labelledby="hub-title">
          {played.map(card)}
        </ul>
      )}
      {finished.length > 0 && (
        <section className="hub-section" aria-labelledby="hub-finished">
          <h3 id="hub-finished">{t('Adventures we finished')}</h3>
          <ul className="hub-campaigns" aria-labelledby="hub-finished">
            {finished.map(card)}
          </ul>
        </section>
      )}
    </>
  );
}

function CampaignCard({
  campaign,
  busy,
  opening,
  onOpen,
  onBook,
}: {
  readonly campaign: AccountCampaign;
  readonly busy: boolean;
  /** Which of the card's two doors was pressed and is opening. */
  readonly opening: 'world' | 'book' | null;
  readonly onOpen: () => void;
  /** Opens the campaign at its book: the party's chapters as one page. */
  readonly onBook: () => void;
}) {
  const t = useT();
  const language = useLanguage();
  const titleId = useId();
  const finished = campaign.finished ?? null;
  // Under "Adventures we finished" the card's name is a heading below that one.
  const Name = finished !== null ? 'h4' : 'h3';
  const day = new Intl.DateTimeFormat(readerLocale(language), { dateStyle: 'long' });
  // A server from before moves sends none.
  const away = campaign.away ?? null;
  const who =
    campaign.role === 'dm'
      ? t('You are the DM')
      : t('You play {name}', {
          name:
            campaign.characters.map((character) => character.name).join(', ') || t('a character'),
        });
  return (
    <li
      className={`hub-campaign${finished !== null ? ' hub-campaign--finished' : ''}`}
      {...campaignAppearance(campaign.name)}
      aria-labelledby={titleId}
    >
      <Glyph name={campaign.role === 'dm' ? 'game-master' : 'character'} />
      <div className="hub-campaign-text">
        <Name id={titleId}>{campaign.name}</Name>
        <p className="muted">
          {who} · {campaign.language === 'ru' ? t('Russian') : t('English')}
        </p>
        {finished !== null && (
          <>
            {finished.played !== null && (
              <p className="muted">
                {day.format(new Date(finished.played.from)) ===
                day.format(new Date(finished.played.to))
                  ? t('Played on {day}', { day: day.format(new Date(finished.played.from)) })
                  : t('Played from {from} to {to}', {
                      from: day.format(new Date(finished.played.from)),
                      to: day.format(new Date(finished.played.to)),
                    })}
              </p>
            )}
            {finished.heroes.length > 0 && (
              <p className="muted">{t('Heroes: {names}', { names: finished.heroes.join(', ') })}</p>
            )}
            {finished.keepsakes.length > 0 && (
              <ul className="hub-keepsakes">
                {finished.keepsakes.map((kept) => (
                  <li key={`${kept.hero}\n${kept.label}`}>
                    <strong>{keptWords(t, kept.hero, kept.kind, kept.label)}</strong>
                    {kept.line !== '' && <span>{kept.line}</span>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {finished === null && campaign.nextGame && (
          <NextGameLine
            next={campaign.nextGame}
            calendar={nativeShell() === null ? calendarHref(campaign.campaignId, 'account') : null}
            className="next-game--hub"
          />
        )}
        {away !== null && (
          <p className="hub-campaign-away">
            {t('Played on {where} since {when}: here you can look, not play.', {
              where: away.destination,
              when: new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(
                new Date(away.movedAt),
              ),
            })}
          </p>
        )}
      </div>
      <div className="hub-campaign-actions">
        {/* Once the party's story has a chapter: a book with none has nothing to open for. */}
        {campaign.chapters > 0 && (
          <button
            type="button"
            className={finished !== null ? 'primary-button' : undefined}
            disabled={busy}
            aria-label={t('The book of {campaign}', { campaign: campaign.name })}
            onClick={onBook}
          >
            <Glyph name="chronicle" />
            {opening === 'book' ? t('Opening…') : t('The book')}
          </button>
        )}
        <button
          type="button"
          className={finished !== null && campaign.chapters > 0 ? undefined : 'primary-button'}
          disabled={busy}
          aria-label={t('Open {campaign}: {who}', { campaign: campaign.name, who })}
          onClick={onOpen}
        >
          {opening === 'world' ? t('Opening…') : finished !== null ? t('Look inside') : t('Open')}
        </button>
      </div>
    </li>
  );
}
