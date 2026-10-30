// Before any schema is built: no eval probe under the page's policy (`schema-config.ts`).
import './schema-config.ts';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './i18n/ru.ts';
import './i18n/ru-play.ts';
import './i18n/ru-visual.ts';
import './i18n/ru-access.ts';
import './i18n/ru-workshop-editor.ts';
import './i18n/ru-workshop-scenario.ts';
import './i18n/ru-workshop-preview.ts';
import './i18n/ru-workshop-editing.ts';
import './i18n/ru-workshop-activation.ts';
import './i18n/ru-images.ts';
import './i18n/ru-table.ts';
import { App } from './session/app.tsx';
import { WorkshopApp } from './workshop/app.tsx';
import { isWorkshopPath, workshopStart } from './workshop/start.ts';
import { takeInvitation } from './session/invitation-link.ts';
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
import './styles/combat-panels.css';
import './styles/board.css';
import './styles/chronicle.css';
import './styles/chronicle-pages.css';
import './styles/flashback.css';
import './styles/sign-in.css';
import './styles/players.css';
import './styles/responsive.css';
import './styles/battle-layout.css';
import './styles/figures.css';
import './styles/board-plates.css';
import './styles/images.css';
import './styles/workshop.css';
import './styles/workshop-editor.css';
import './styles/workshop-generation.css';
import './styles/workshop-scenario.css';
import './styles/workshop-preview.css';
import './styles/workshop-pictures.css';
import './styles/workshop-editing.css';
import './styles/workshop-activation.css';

// An invitation link's token leaves the address before anything is requested or rendered
// (docs/adr/0036-production-sign-in.md §7) and waits in a one-shot holder, never bound here,
// until the person takes their seat (docs/STAGE_340_DESIGN.md "Part B review fixes"); without
// one, the page's first request — whether this browser is signed in — is sent exactly once.
const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
if (isWorkshopPath(window.location.pathname)) {
  const start = workshopStart(window.location, window.history);
  createRoot(root).render(
    <StrictMode>
      <WorkshopApp start={start} />
    </StrictMode>,
  );
} else {
  const start = pageStart(takeInvitation(window.location, window.history), fetch);
  createRoot(root).render(
    <StrictMode>
      <App start={start} />
    </StrictMode>,
  );
}
