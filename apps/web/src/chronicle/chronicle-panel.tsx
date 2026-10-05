import type {
  ChronicleChapterView,
  ChronicleListResponse,
  EntityRef,
  FlashbackResponse,
  GenerateChronicleResponse,
} from '@ltw/contracts';
import { StatusPanel } from '@ltw/ui';
import { useCallback, useState } from 'react';

import { ApiError, type WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { formatWorldTime } from '../dm/world-time.ts';

/**
 * The Chronicle: chapters told from the viewing perspective's own memories, each
 * paragraph citing entries that keep the epistemic type of what they rest on. The
 * DM may ask for a new chapter; the server writes and validates it.
 */
export function ChroniclePanel({
  api,
  isDm,
  characters,
}: {
  readonly api: WorldApi;
  readonly isDm: boolean;
  readonly characters: readonly EntityRef[];
}) {
  const [revision, setRevision] = useState(0);
  const load = useCallback(
    (signal: AbortSignal) => api.get<ChronicleListResponse>('chronicle', signal),
    [api],
  );
  const { resource, retry } = useResource(`chronicle:${String(revision)}`, load);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="chronicle" aria-label="Chronicle">
      <h2>Chronicle</h2>
      {isDm && (
        <Generate
          api={api}
          characters={characters}
          onDone={() => {
            setRevision((value) => value + 1);
          }}
        />
      )}
      {resource.status !== 'ready' ? (
        <StatusPanel
          state={resource.status}
          label={resource.status === 'error' ? resource.message : 'Opening the chronicle…'}
          onRetry={retry}
        />
      ) : resource.value.chapters.length === 0 ? (
        <p className="muted">No chapter has been written for this view yet.</p>
      ) : (
        resource.value.chapters.map((chapter) => (
          <Chapter
            key={chapter.chronicleId}
            api={api}
            chapter={chapter}
            open={open}
            onOpen={setOpen}
          />
        ))
      )}
    </section>
  );
}

function Chapter({
  api,
  chapter,
  open,
  onOpen,
}: {
  readonly api: WorldApi;
  readonly chapter: ChronicleChapterView;
  readonly open: string | null;
  readonly onOpen: (memoryId: string | null) => void;
}) {
  const entries = new Map(chapter.entries.map((entry) => [entry.key, entry]));
  return (
    <article className="chronicle-chapter" aria-label={chapter.title}>
      <h3>{chapter.title}</h3>
      <p className="muted">
        {formatWorldTime(chapter.from)} – {formatWorldTime(chapter.to)}
      </p>
      {chapter.prose.paragraphs.map((paragraph, index) => (
        <div key={index} className="chronicle-paragraph">
          <p>{paragraph.text}</p>
          <ul className="chronicle-cites">
            {paragraph.cites.map((key) => {
              const entry = entries.get(key);
              if (!entry) return null;
              return (
                <li key={key}>
                  <span>{entry.text}</span>{' '}
                  {entry.knowledge.map((record) => (
                    <span key={record.knowledgeId} className="badge">
                      {record.knowledgeType}
                    </span>
                  ))}
                  {entry.memoryId && (
                    <button
                      aria-expanded={open === entry.memoryId}
                      onClick={() => {
                        onOpen(open === entry.memoryId ? null : entry.memoryId);
                      }}
                    >
                      Open flashback
                    </button>
                  )}
                  {entry.memoryId && open === entry.memoryId && (
                    <Flashback api={api} memoryId={entry.memoryId} />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </article>
  );
}

function Flashback({ api, memoryId }: { readonly api: WorldApi; readonly memoryId: string }) {
  const load = useCallback(
    (signal: AbortSignal) =>
      api.get<FlashbackResponse>(`memories/${encodeURIComponent(memoryId)}/flashback`, signal),
    [api, memoryId],
  );
  const { resource, retry } = useResource(memoryId, load);
  if (resource.status !== 'ready')
    return (
      <StatusPanel
        state={resource.status}
        label={resource.status === 'error' ? resource.message : 'Remembering…'}
        onRetry={retry}
      />
    );
  const flashback = resource.value;
  return (
    <section className="flashback" aria-label="Flashback">
      <p className="eyebrow">
        {formatWorldTime(flashback.worldTime)} · {flashback.phase}
      </p>
      <p>
        {flashback.scene
          ? `At ${flashback.scene.entityId.replaceAll('-', ' ')}`
          : 'A place you recall'}
        {flashback.participants.length > 0 &&
          ` with ${flashback.participants.map((who) => who.entity.name).join(', ')}`}
      </p>
      <blockquote>
        {flashback.dialogue.speaker && <strong>{flashback.dialogue.speaker.name}: </strong>}
        {flashback.dialogue.text}
        {flashback.dialogue.knowledgeType && (
          <span className="badge">{flashback.dialogue.knowledgeType}</span>
        )}
      </blockquote>
    </section>
  );
}

function Generate({
  api,
  characters,
  onDone,
}: {
  readonly api: WorldApi;
  readonly characters: readonly EntityRef[];
  readonly onDone: () => void;
}) {
  const [title, setTitle] = useState('Chapter I — Shadows on the Trade Road');
  const [scope, setScope] = useState('PARTY');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const generate = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.post<GenerateChronicleResponse>(
        'chronicle',
        { title, perspective: scope, from: 0 },
        new AbortController().signal,
      );
      setMessage(
        result.result.status === 'rejected'
          ? 'The chronicle could not be written from the current events.'
          : 'Chapter written.',
      );
      if (result.result.status !== 'rejected') onDone();
    } catch (error) {
      setMessage(
        error instanceof ApiError && error.status === 422
          ? 'There is nothing to tell for that view yet.'
          : 'The chronicle could not be written. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="disclosure">
      <summary>Write a chapter (DM)</summary>
      <label htmlFor="chapter-title">Title</label>
      <input
        id="chapter-title"
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
        }}
      />
      <label htmlFor="chapter-scope">Told from</label>
      <select
        id="chapter-scope"
        value={scope}
        onChange={(event) => {
          setScope(event.target.value);
        }}
      >
        <option value="PARTY">Party</option>
        <option value="PUBLIC">Public</option>
        {characters.map((entity) => (
          <option key={entity.entityId} value={`CHARACTER:${entity.entityId}`}>
            {entity.name}
          </option>
        ))}
      </select>
      <button disabled={busy || title.trim() === ''} onClick={() => void generate()}>
        Write chapter
      </button>
      {message && <p role="status">{message}</p>}
    </details>
  );
}
