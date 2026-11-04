// The trust page's two jobs (docs/adr/0061-local-mode.md §3): the language this device asks for
// (Russian or English, the switch remembered on this device), and whether it already trusts the
// laptop. That check asks the HTTPS address for its health without reading the answer: it only
// succeeds when the connection's certificate is trusted.
'use strict';

const LANGUAGES = ['ru', 'en'];
const TITLES = {
  ru: 'Стол на этом ноутбуке · Living Tabletop World',
  en: 'The table on this laptop · Living Tabletop World',
};
const table = `https://${location.hostname}/`;

function stored() {
  try {
    return localStorage.getItem('ltw-trust-language');
  } catch {
    return null;
  }
}

function remember(language) {
  try {
    localStorage.setItem('ltw-trust-language', language);
  } catch {
    // A private window keeps nothing: the device's language next time.
  }
}

function chosen() {
  const kept = stored();
  if (LANGUAGES.includes(kept)) return kept;
  const asked = (navigator.languages || [navigator.language || 'ru']).map((one) => one.slice(0, 2));
  return asked.find((one) => LANGUAGES.includes(one)) || 'ru';
}

function show(language) {
  document.documentElement.lang = language;
  document.title = TITLES[language];
  for (const block of document.querySelectorAll('[data-language-block]')) {
    block.hidden = block.dataset.languageBlock !== language;
  }
  for (const button of document.querySelectorAll('[data-language]')) {
    button.setAttribute('aria-pressed', String(button.dataset.language === language));
  }
}

function state(name) {
  for (const check of document.querySelectorAll('[data-check]')) {
    check.dataset.trust = name;
    for (const line of check.querySelectorAll('[data-state]')) {
      line.hidden = line.dataset.state !== name;
    }
    for (const link of check.querySelectorAll('[data-table]')) link.hidden = name !== 'trusted';
  }
}

async function check() {
  state('checking');
  try {
    await fetch(`${table}api/healthz`, { mode: 'no-cors', cache: 'no-store' });
    state('trusted');
  } catch {
    state('untrusted');
  }
}

for (const link of document.querySelectorAll('[data-table]')) link.href = table;
for (const button of document.querySelectorAll('[data-language]')) {
  button.addEventListener('click', () => {
    remember(button.dataset.language);
    show(button.dataset.language);
  });
}
for (const button of document.querySelectorAll('[data-recheck]')) {
  button.addEventListener('click', () => {
    void check();
  });
}
show(chosen());
void check();
