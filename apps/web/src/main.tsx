import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './i18n/ru.ts';
import './i18n/ru-play.ts';
import './i18n/ru-visual.ts';
import './i18n/ru-access.ts';
import { App } from './session/app.tsx';
import { takeInvitation } from './session/invitation-link.ts';
import { firstStep } from './session/sign-in-flow.ts';
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
import './styles/combat-panels.css';
import './styles/board.css';
import './styles/chronicle.css';
import './styles/chronicle-pages.css';
import './styles/flashback.css';
import './styles/sign-in.css';
import './styles/players.css';
import './styles/responsive.css';
import './styles/battle-layout.css';

// An invitation link's token leaves the address before anything is requested
// (docs/adr/0036-production-sign-in.md §7), and the page's first request — redeem that
// invitation, or ask whether this browser is signed in — is sent exactly once.
const invitation = takeInvitation(window.location, window.history);
const start = { joining: invitation !== null, first: firstStep(invitation, fetch) };

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(
  <StrictMode>
    <App start={start} />
  </StrictMode>,
);
