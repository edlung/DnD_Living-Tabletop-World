import { useState } from 'react';

import type { ExplorationIntent } from './use-action.ts';

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
  const [statement, setStatement] = useState('');
  const [scope, setScope] = useState<'PARTY' | 'CHARACTER'>('PARTY');
  return (
    <details className="disclosure hypothesis-form">
      <summary>Form a hypothesis</summary>
      <p className="muted">Record your interpretation. A hypothesis does not establish a fact.</p>
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
        <label htmlFor="hypothesis">Hypothesis</label>
        <textarea
          id="hypothesis"
          required
          maxLength={2000}
          value={statement}
          onChange={(event) => {
            setStatement(event.target.value);
          }}
        />
        <label htmlFor="hypothesis-scope">Share with</label>
        <select
          id="hypothesis-scope"
          value={scope}
          onChange={(event) => {
            setScope(event.target.value === 'PARTY' ? 'PARTY' : 'CHARACTER');
          }}
        >
          <option value="PARTY">Party</option>
          <option value="CHARACTER">Only my character</option>
        </select>
        <button type="submit" disabled={locked || !statement.trim()}>
          Record hypothesis
        </button>
      </form>
    </details>
  );
}
