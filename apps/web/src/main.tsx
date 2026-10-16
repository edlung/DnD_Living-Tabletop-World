import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './i18n/ru.ts';
import './i18n/ru-play.ts';
import './i18n/ru-visual.ts';
import { App } from './session/app.tsx';
import './styles/tokens.css';
import './styles/fonts.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/scene.css';
import './styles/stage.css';
import './styles/details.css';
import './styles/tools.css';
import './styles/combat.css';
import './styles/combat-panels.css';
import './styles/board.css';
import './styles/chronicle.css';
import './styles/sign-in.css';
import './styles/responsive.css';
import './styles/battle-layout.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
