// Before any schema is built: no eval probe under the page's policy (`schema-config.ts`).
import './schema-config.ts';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './i18n/ru.ts';
import './i18n/ru-play.ts';
import './i18n/ru-visual.ts';
import './i18n/ru-access.ts';
import './i18n/ru-images.ts';
import './i18n/ru-table.ts';
import './i18n/ru-items.ts';
import './i18n/ru-character.ts';
import './i18n/ru-dice.ts';
import './i18n/ru-inventory.ts';
import './i18n/ru-travel.ts';
import './i18n/ru-editors.ts';
import './i18n/ru-library.ts';
import './i18n/ru-rest.ts';
import './i18n/ru-rules.ts';
import './i18n/ru-accounts.ts';
import './i18n/ru-display.ts';
import './i18n/ru-dm-screen.ts';
import './i18n/ru-chat.ts';
import './i18n/ru-guide.ts';
import './i18n/ru-builder.ts';
import './i18n/ru-features.ts';
import './i18n/ru-summons.ts';
import './i18n/ru-encounters.ts';
import './i18n/ru-companion.ts';
import './i18n/ru-conditions.ts';
import './i18n/ru-weapons.ts';
import './i18n/ru-hit-points.ts';
import './i18n/ru-space.ts';
import './i18n/ru-native.ts';
import './i18n/ru-atmosphere.ts';
import './i18n/ru-voice.ts';
import './i18n/ru-moves.ts';
import './i18n/ru-privacy.ts';
import { DisplayApp } from './display/display-app.tsx';
import { PrivacyPage } from './session/privacy-notice.tsx';
import { startNative } from './native/start.ts';
import { App } from './session/app.tsx';
import { WorkshopApp } from './workshop/app.tsx';
import { isWorkshopPath, workshopStart } from './workshop/start.ts';
import { takeInvitation, takeReset, takeTable } from './session/invitation-link.ts';
import { pageStart } from './session/sign-in-flow.ts';
import './styles/tokens.css';
import './styles/fonts.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/scene.css';
import './styles/stage.css';
import './styles/details.css';
import './styles/tools.css';
import './styles/dm-tools.css';
import './styles/combat.css';
import './styles/turn-tray.css';
import './styles/combat-panels.css';
import './styles/board.css';
import './styles/board-hand.css';
import './styles/encounters.css';
import './styles/chronicle.css';
import './styles/chronicle-pages.css';
import './styles/flashback.css';
import './styles/sign-in.css';
import './styles/players.css';
import './styles/accounts.css';
import './styles/display.css';
import './styles/screen-sheet.css';
import './styles/display-moments.css';
import './styles/sound.css';
import './styles/dm-screen.css';
import './styles/chat.css';
import './styles/voice.css';
import './styles/guide.css';
import './styles/builder.css';
import './styles/features.css';
import './styles/summons.css';
import './styles/shared-screen.css';
import './styles/native.css';
import './styles/responsive.css';
import './styles/battle-layout.css';
import './styles/figures.css';
import './styles/board-plates.css';
import './styles/board-terrain.css';
import './styles/images.css';
import './styles/battle-maps.css';
import './styles/items.css';
import './styles/trade.css';
import './styles/travel.css';
import './styles/editors.css';
import './styles/library.css';
import './styles/character.css';
import './styles/character-tabs.css';
import './styles/dice.css';
import './styles/rest.css';
import './styles/rules.css';
import './styles/workshop.css';
import './styles/print.css';

// An invitation link's token leaves the address before anything is requested or rendered
// (docs/adr/0036-production-sign-in.md §7) and waits in a one-shot holder, never bound here,
// until the person takes their seat (docs/STAGE_340_DESIGN.md "Part B review fixes"); without
// one, the page's first request — whether this browser is signed in — is sent exactly once.
const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
if (window.location.pathname === '/display' || window.location.pathname === '/display/') {
  // The table's screen (docs/adr/0042-table-display.md): a device, not a person's sign-in.
  createRoot(root).render(
    <StrictMode>
      <DisplayApp />
    </StrictMode>,
  );
} else if (window.location.pathname === '/privacy' || window.location.pathname === '/privacy/') {
  // The privacy notice (docs/adr/0062-account-privacy.md §1): readable before signing in.
  createRoot(root).render(
    <StrictMode>
      <PrivacyPage language={navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en'} />
    </StrictMode>,
  );
} else if (isWorkshopPath(window.location.pathname)) {
  const start = workshopStart(window.location, window.history);
  createRoot(root).render(
    <StrictMode>
      <WorkshopApp start={start} />
    </StrictMode>,
  );
} else {
  const reset = takeReset(window.location, window.history);
  const table = takeTable(window.location, window.history);
  const start = pageStart(takeInvitation(window.location, window.history), fetch, reset, table);
  createRoot(root).render(
    <StrictMode>
      <App start={start} />
    </StrictMode>,
  );
}
// In LTW Player or LTW DM, the page's side of the bridge (docs/adr/0070-native-apps.md §2).
startNative();
