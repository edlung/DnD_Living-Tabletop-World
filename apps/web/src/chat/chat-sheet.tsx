import type { ChatChannel, ChatMessageView, ChatVoice, EntityRef, RollEntry } from '@ltw/contracts';
import { CHAT_TEXT_MAX } from '@ltw/contracts';
import { StatusPanel, useLanguage, useT, type Translate } from '@ltw/ui';
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useDiceTable } from '../dice/table.tsx';
import { rollMarks, rollSentence } from '../dice/words.ts';
import { Sheet } from '../shell/sheet.tsx';
import type { Shell } from '../shell/use-shell.ts';
import { useScrollEdges } from '../visual/scroll-edges.ts';
import { VoicePanel } from '../voice/voice-panel.tsx';

/**
 * The table's chat (docs/adr/0044-online-play.md §1): the table's talk, a whisper to the DM, the
 * DM's word to one player, with the table's rolls woven in by time — for online play, and for a
 * private word at the table too. A player speaks as their character or out of character; the DM
 * narrates or speaks plainly. Enter sends; Shift+Enter starts a new line. Online, the table's voice
 * (docs/adr/0060-voice.md) sits above it.
 */
type Line =
  | { readonly kind: 'message'; readonly at: string; readonly message: ChatMessageView }
  | { readonly kind: 'roll'; readonly at: string; readonly roll: RollEntry };

const time = (at: string, language: string) =>
  new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(new Date(at));

function speakerOf(t: Translate, message: ChatMessageView): string {
  if (message.speaker === null) return t('The DM');
  return message.speaker.name ?? t('Someone');
}

function whereOf(t: Translate, message: ChatMessageView): string | null {
  if (message.channel === 'dm') return t('to the DM');
  if (message.channel === 'player') {
    return t('to {name}', { name: message.recipient?.name ?? t('someone') });
  }
  return null;
}

export function ChatSheet({
  api,
  shell,
  characters,
}: {
  readonly api: WorldApi;
  readonly shell: Shell;
  /** The characters at the table, for the DM's word to one player. */
  readonly characters: readonly EntityRef[];
}) {
  const t = useT();
  const language = useLanguage();
  const table = useDiceTable();
  const open = shell.sheet === 'chat';
  const ids = useId();
  const log = useRef<HTMLOListElement>(null);
  const following = useRef(true);
  const sending = useRef<string | null>(null);
  const [text, setText] = useState('');
  const [channel, setChannel] = useState<string>('table');
  const [voice, setVoice] = useState<ChatVoice>('in-character');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chat = table?.chat;
  const messages = chat?.log.status === 'ready' ? chat.log.value.messages : [];
  const rolls = table?.feed.status === 'ready' ? table.feed.value.rolls : [];
  const lines: Line[] = [
    ...messages.map((message): Line => ({ kind: 'message', at: message.at, message })),
    ...rolls.map((roll): Line => ({ kind: 'roll', at: roll.at, roll })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const count = lines.length;
  const edges = useScrollEdges(log, `${String(count)}|${String(open)}`, 'y');
  // Opening the chat reads it; new lines keep it read while it is open.
  useEffect(() => {
    if (open) chat?.markRead();
  }, [open, count]);
  // The log follows its newest line unless the reader scrolled up.
  useLayoutEffect(() => {
    const element = log.current;
    if (element && following.current) element.scrollTop = element.scrollHeight;
  }, [count, open]);
  if (!table || !chat) return null;
  const isDm = table.isDm;
  const send = async () => {
    const said = text.trim();
    if (said === '') {
      setProblem(t('Write something first.'));
      return;
    }
    // The same words twice while they are on their way are one message; new words go too.
    if (sending.current === said) return;
    sending.current = said;
    setBusy(true);
    setProblem(null);
    const recipient = channel.startsWith('to:') ? channel.slice(3) : null;
    const sent = await chat.send({
      channel: (recipient === null ? channel : 'player') as ChatChannel,
      voice,
      text: said,
      ...(recipient === null ? {} : { recipientId: recipient }),
    });
    if (sending.current === said) sending.current = null;
    setBusy(false);
    if (sent) {
      // Only what was sent goes: words typed while it was on its way stay.
      setText((draft) => (draft.trim() === said ? '' : draft));
      following.current = true;
    } else {
      setProblem(t('The message could not be sent. Try again.'));
    }
  };
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  };
  return (
    <Sheet id="chat" title={t('Chat')} glyph="talk" open={open} onClose={shell.closeSheet}>
      {table.online && <VoicePanel api={api} isDm={isDm} />}
      <div className="chat">
        {chat.log.status !== 'ready' ? (
          <StatusPanel
            state={chat.log.status === 'error' ? 'error' : 'loading'}
            label={chat.log.status === 'error' ? chat.log.message : t('Reading the chat…')}
          />
        ) : count === 0 ? (
          <p className="muted chat-empty">{t('Nothing said yet. Say hello to the table.')}</p>
        ) : (
          <ol
            ref={log}
            className="chat-log"
            aria-label={t('The table’s talk and rolls')}
            tabIndex={0}
            data-more-before={edges.before || undefined}
            data-more-after={edges.after || undefined}
            onScroll={(event) => {
              const element = event.currentTarget;
              following.current =
                element.scrollTop + element.clientHeight >= element.scrollHeight - 24;
            }}
          >
            {lines.map((line) =>
              line.kind === 'roll' ? (
                <li key={line.roll.rollId} className="chat-line chat-line--roll">
                  <span className="chat-time">{time(line.at, language)}</span>
                  <span>
                    {rollSentence(t, line.roll)}
                    {rollMarks(t, line.roll, isDm).map((mark) => (
                      <span key={mark} className="chat-where">
                        {/* The dot stays with the words before it (never at a line's start). */}
                        {'\u00a0· '}
                        {mark}
                      </span>
                    ))}
                  </span>
                </li>
              ) : (
                <li
                  key={line.message.messageId}
                  className={`chat-line chat-line--${line.message.channel} chat-line--${line.message.voice}`}
                >
                  <span className="chat-time">{time(line.at, language)}</span>
                  <span className="chat-speaker">
                    {speakerOf(t, line.message)}
                    {whereOf(t, line.message) && (
                      <span className="chat-where"> · {whereOf(t, line.message)}</span>
                    )}
                  </span>
                  <span className="chat-text">{line.message.text}</span>
                </li>
              ),
            )}
          </ol>
        )}
        <form
          className="chat-compose"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <div className="chat-options">
            <label htmlFor={`${ids}-channel`}>{t('To')}</label>
            <select
              id={`${ids}-channel`}
              value={channel}
              onChange={(event) => {
                setChannel(event.target.value);
              }}
            >
              <option value="table">{t('Everyone at the table')}</option>
              {isDm ? (
                characters.map((character) => (
                  <option key={character.entityId} value={`to:${character.entityId}`}>
                    {t('Only {name}', { name: character.name })}
                  </option>
                ))
              ) : (
                <option value="dm">{t('Only the DM')}</option>
              )}
            </select>
            <label htmlFor={`${ids}-voice`}>{t('As')}</label>
            <select
              id={`${ids}-voice`}
              value={voice}
              onChange={(event) => {
                setVoice(event.target.value as ChatVoice);
              }}
            >
              <option value="in-character">{isDm ? t('Narration') : t('My character')}</option>
              <option value="out-of-character">{t('Out of character')}</option>
            </select>
          </div>
          <label htmlFor={`${ids}-text`} className="visually-hidden">
            {t('Message')}
          </label>
          <textarea
            id={`${ids}-text`}
            rows={2}
            maxLength={CHAT_TEXT_MAX}
            value={text}
            aria-invalid={problem !== null || undefined}
            aria-describedby={problem ? `${ids}-problem` : `${ids}-hint`}
            onChange={(event) => {
              setText(event.target.value);
              if (problem) setProblem(null);
            }}
            onKeyDown={onKey}
          />
          {problem ? (
            <p id={`${ids}-problem`} className="account-field-error" role="alert">
              {problem}
            </p>
          ) : (
            <p id={`${ids}-hint`} className="field-hint">
              {t('Enter sends; Shift and Enter start a new line.')}
            </p>
          )}
          <button type="submit" className="primary-button" disabled={busy}>
            {t('Send')}
          </button>
        </form>
      </div>
    </Sheet>
  );
}
