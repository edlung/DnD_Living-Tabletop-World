import { LanguageProvider, useT, type Language } from '@ltw/ui';
import { useState } from 'react';

import { ornamentUrl, textureUrl } from '../visual/ui-kit.ts';

/**
 * The privacy notice (`/privacy`; docs/adr/0062-account-privacy.md §1): what the game keeps about a
 * person, why, who sees it, what leaves the server, how long it stays, and how to take a copy or
 * delete the account. Readable before signing in, in the browser's language or the other one.
 */
export function PrivacyPage({ language: initial }: { readonly language: Language }) {
  const [language, setLanguage] = useState<Language>(initial);
  return (
    <LanguageProvider language={language}>
      <main className="sign-in hub-page privacy-page" lang={language}>
        <img className="sign-in-art" src={textureUrl('brand-keyart')} alt="" />
        <div className="sign-in-scrim" aria-hidden="true" />
        <PrivacyNotice language={language} onLanguage={setLanguage} />
      </main>
    </LanguageProvider>
  );
}

const KEPT = [
  'Your account: the login you chose, a hash of your password (never the password itself) and the name the table sees. No e-mail, no phone number.',
  'Your campaigns: which ones you sit in, your characters, and each campaign’s story as it is played.',
  'What you write and roll: your chat messages and your dice rolls.',
  'Your sign-ins: when each began and when it ends, to keep you signed in. Cookies hold these sign-ins and nothing else.',
] as const;

const SECTIONS = [
  {
    title: 'Why',
    text: 'To play: to show each person what their character knows, to keep the story, and to let you come back.',
  },
  {
    title: 'Who sees it',
    text: 'The people at your table, each as much as their character perceives, and the DM, who sees the whole campaign. The operator of the server can read its database to keep it running and safe.',
  },
  {
    title: 'What leaves the server',
    text: 'Nothing, unless the server’s owner turns AI on. Then the text of a scene, an action or a question goes to the AI provider the owner chose, to write the narration or a character’s words; your login, your password and your sign-ins never do. Pictures come from the game’s own set unless the owner turns their making on.',
  },
  {
    title: 'How long',
    text: 'As long as your account and your campaigns exist. The server’s backups keep earlier states for up to two months, then they are gone.',
  },
  {
    title: 'No tracking, no advertising',
    text: 'The game counts nothing about you for anyone else, shows no advertising and loads nothing from other sites.',
  },
  {
    title: 'Your copy, and deleting your account',
    text: 'On your account’s page, “Download my data” saves a copy: your account, your sign-ins and, in each campaign, your characters, your messages and your rolls. “Delete my account” forgets your login, your name and your password and signs you out everywhere; your characters stay in their campaigns’ story. A DM’s account is deleted by the server’s operator, so that no campaign loses its DM.',
  },
  {
    title: 'Questions',
    text: 'Ask your DM, or the person who runs the server you play on.',
  },
] as const;

function PrivacyNotice({
  language,
  onLanguage,
}: {
  readonly language: Language;
  readonly onLanguage: (language: Language) => void;
}) {
  const t = useT();
  return (
    <section className="sign-in-panel hub-panel privacy-panel" aria-labelledby="privacy-title">
      <div className="privacy-head">
        <p className="sign-in-brand">
          <img src={ornamentUrl('emblem')} alt="" />
          <span>{t('Living Tabletop World')}</span>
        </p>
        <div className="privacy-languages" role="group" aria-label={t('Language')}>
          {(['ru', 'en'] as const).map((choice) => (
            <button
              key={choice}
              type="button"
              lang={choice}
              aria-pressed={language === choice}
              onClick={() => {
                onLanguage(choice);
              }}
            >
              {choice === 'ru' ? 'Русский' : 'English'}
            </button>
          ))}
        </div>
      </div>
      <h1 id="privacy-title">{t('Privacy notice')}</h1>
      <p className="privacy-lead">
        {t(
          'Living Tabletop World keeps only what the game needs. Here is what that is, why, who sees it, how long it stays, and how you take a copy or delete your account.',
        )}
      </p>
      <h2>{t('What is kept')}</h2>
      <ul>
        {KEPT.map((line) => (
          <li key={line}>{t(line)}</li>
        ))}
      </ul>
      {SECTIONS.map((section) => (
        <section key={section.title} aria-label={t(section.title)}>
          <h2>{t(section.title)}</h2>
          <p>{t(section.text)}</p>
        </section>
      ))}
      <p>
        <a className="button-link" href="/">
          {t('Back to the game')}
        </a>
      </p>
    </section>
  );
}
