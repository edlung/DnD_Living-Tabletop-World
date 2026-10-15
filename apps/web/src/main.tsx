import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './i18n/ru.ts';
import './i18n/ru-play.ts';
import { App } from './session/app.tsx';
import './styles/base.css';
import './styles/scene.css';
import './styles/details.css';
import './styles/responsive.css';
import './styles/exploration.css';
import './styles/actions.css';
import './styles/combat.css';
import './styles/authoring.css';
import './styles/live.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
