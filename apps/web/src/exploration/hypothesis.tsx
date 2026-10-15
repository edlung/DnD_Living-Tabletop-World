import { useState } from 'react';

import type { ExplorationIntent } from './use-action.ts';
import { useT } from '@ltw/ui';

export function Hypothesis({
  characterId,
  entityId,
  locked,
  onRun,
}: {
  readonly characterId: string;
  readonly entityId: string;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
  const [statement, setStatement] = useState('');
  const [scope, setScope] = useState<'PARTY' | 'CHARACTER'>('PARTY');
  return (
    <details className="disclosure hypothesis-form">
      <summary>{t('Form a hypothesis')}</summary>
      <p className="muted">
        {t('Record your interpretation. A hypothesis does not establish a fact.')}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!locked && statement.trim())
            onRun({
              kind: 'command',
              command: {
                type: 'FormHypothesis',
                characterId,
                scope,
                statement: statement.trim(),
                subjects: [entityId],
              },
            });
        }}
      >
        <label htmlFor="hypothesis">{t('Hypothesis')}</label>
        <textarea
          id="hypothesis"
          required
          maxLength={2000}
          value={statement}
          onChange={(event) => {
            setStatement(event.target.value);
          }}
        />
        <label htmlFor="hypothesis-scope">{t('Share with')}</label>
        <select
          id="hypothesis-scope"
          value={scope}
          onChange={(event) => {
            setScope(event.target.value === 'PARTY' ? 'PARTY' : 'CHARACTER');
          }}
        >
          <option value="PARTY">{t('Party')}</option>
          <option value="CHARACTER">{t('Only my character')}</option>
        </select>
        <button type="submit" disabled={locked || !statement.trim()}>
          {t('Record hypothesis')}
        </button>
      </form>
    </details>
  );
}
