import type { EntityRef, KnowledgeListResponse } from '@ltw/contracts';
import { StatusPanel } from '@ltw/ui';
import { useCallback, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import type { ExplorationIntent } from './use-action.ts';

/** Recommendation caps never prevent a deliberate choice of another known subject. */
export function ConversationOptions({
  api,
  directory,
  characterId,
  npcId,
  locked,
  onRun,
}: {
  readonly api: WorldApi;
  readonly directory: readonly EntityRef[];
  readonly characterId: string;
  readonly npcId: string;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const [topic, setTopic] = useState('');
  const [evidence, setEvidence] = useState('');
  const [showEvidence, setShowEvidence] = useState(false);
  const load = useCallback(
    (signal: AbortSignal) =>
      api.get<KnowledgeListResponse>('knowledge', signal, true, { type: 'EVIDENCE' }),
    [api],
  );
  return (
    <details className="disclosure">
      <summary>More conversation options</summary>
      <p className="muted">Choose another subject you know, or show a piece of evidence.</p>
      <label htmlFor="conversation-subject">Conversation subject</label>
      <select
        id="conversation-subject"
        value={topic}
        onChange={(event) => {
          setTopic(event.target.value);
        }}
      >
        <option value="">Choose a known subject</option>
        {directory
          .filter((entity) => entity.entityId !== npcId && entity.entityId !== characterId)
          .map((entity) => (
            <option key={entity.entityId} value={entity.entityId}>
              {entity.name}
            </option>
          ))}
      </select>
      <div className="action-row">
        <button
          disabled={locked || !topic}
          onClick={() => {
            onRun({
              kind: 'command',
              command: { type: 'AskAbout', characterId, npcId, topicId: topic },
            });
          }}
        >
          Ask selected subject
        </button>
        <button
          disabled={locked || !topic}
          onClick={() => {
            onRun({
              kind: 'command',
              command: { type: 'InsightCheck', characterId, npcId, topicId: topic },
            });
          }}
        >
          Read intentions
        </button>
      </div>
      <button
        onClick={() => {
          setShowEvidence((open) => !open);
        }}
        aria-expanded={showEvidence}
      >
        Show evidence
      </button>
      {showEvidence && (
        <EvidencePicker
          load={load}
          evidence={evidence}
          onSelect={setEvidence}
          onSubmit={() => {
            onRun({
              kind: 'command',
              command: { type: 'ShowEvidence', characterId, npcId, knowledgeId: evidence },
            });
          }}
          locked={locked}
        />
      )}
    </details>
  );
}

function EvidencePicker({
  load,
  evidence,
  onSelect,
  onSubmit,
  locked,
}: {
  readonly load: (signal: AbortSignal) => Promise<KnowledgeListResponse>;
  readonly evidence: string;
  readonly onSelect: (id: string) => void;
  readonly onSubmit: () => void;
  readonly locked: boolean;
}) {
  const { resource, retry } = useResource('evidence', load);
  if (resource.status !== 'ready')
    return (
      <StatusPanel
        state={resource.status}
        label={resource.status === 'error' ? resource.message : 'Loading your evidence…'}
        onRetry={retry}
      />
    );
  return (
    <div className="evidence-picker">
      <label htmlFor="evidence-to-show">Evidence to show</label>
      <select
        id="evidence-to-show"
        value={evidence}
        onChange={(event) => {
          onSelect(event.target.value);
        }}
      >
        <option value="">Choose evidence</option>
        {resource.value.knowledge.map((record) => (
          <option key={record.knowledgeId} value={record.knowledgeId}>
            {record.statement}
          </option>
        ))}
      </select>
      {resource.value.knowledge.length === 0 && <p>No evidence is known in this perspective.</p>}
      <button disabled={locked || !evidence} onClick={onSubmit}>
        Show selected evidence
      </button>
    </div>
  );
}
