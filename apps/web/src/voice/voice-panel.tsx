import { useT } from '@ltw/ui';
import { useEffect, useId, type KeyboardEvent } from 'react';

import type { WorldApi } from '../api/client.ts';
import { Glyph } from '../visual/glyph.tsx';
import { useVoice } from './use-voice.ts';

/**
 * The table's voice on the Chat sheet (docs/adr/0060-voice.md §4–6): join and leave; the microphone
 * on, or off with "hold to talk"; the microphone's choice; "this screen shares a room with another"
 * (it then plays nobody's voice and talks only while held); who is in the room, who talks; and the
 * DM's mute and removal. A refused microphone is explained, and the screen still listens.
 */
export function VoicePanel({ api, isDm }: { readonly api: WorldApi; readonly isDm: boolean }) {
  const t = useT();
  const ids = useId();
  const { session, shown } = useVoice(api);
  // The panel shows only while the table plays online: each time it comes, so did a new room.
  useEffect(() => {
    session.forgetEarlierRoom();
  }, [session]);
  const peers = shown.room?.peers ?? [];
  const me = shown.room?.you ?? null;
  const mutedByDm = peers.find((peer) => peer.peerId === me)?.muted ?? false;
  const holdKey = (event: KeyboardEvent<HTMLButtonElement>, down: boolean) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (!event.repeat) session.hold(down);
  };
  const inside = shown.status === 'in';
  return (
    <section className="voice" aria-labelledby={`${ids}-title`} data-voice={shown.status}>
      <h3 id={`${ids}-title`}>
        <Glyph name="talk" />
        {t('Voice')}
      </h3>
      {!inside ? (
        <>
          {shown.status === 'refused' && (
            <p className="muted">{t('The voice opens while the session plays online.')}</p>
          )}
          {shown.status === 'removed' ? (
            // Until the room ends (ADR 0060 §6): no button that could only be refused.
            <p className="muted">
              {t('The DM took you out of the voice.')}{' '}
              {t('You can join again the next time the table plays online.')}
            </p>
          ) : (
            <button
              type="button"
              className="primary-button"
              disabled={shown.status === 'joining'}
              onClick={() => {
                session.join();
              }}
            >
              {shown.status === 'joining' ? t('Joining the voice…') : t('Join the voice')}
            </button>
          )}
        </>
      ) : (
        <>
          <div className="action-row">
            <button
              type="button"
              aria-pressed={shown.open}
              disabled={shown.noMicrophone || mutedByDm}
              onClick={() => {
                session.setOpen(!shown.open);
              }}
            >
              {shown.open ? t('Microphone on') : t('Microphone off')}
            </button>
            {!shown.open && (
              <button
                type="button"
                className={`voice-hold${shown.holding ? ' is-holding' : ''}`}
                disabled={shown.noMicrophone || mutedByDm}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  session.hold(true);
                }}
                onPointerUp={() => {
                  session.hold(false);
                }}
                onPointerCancel={() => {
                  session.hold(false);
                }}
                onKeyDown={(event) => {
                  holdKey(event, true);
                }}
                onKeyUp={(event) => {
                  holdKey(event, false);
                }}
                onBlur={() => {
                  session.hold(false);
                }}
              >
                {t('Hold to talk')}
              </button>
            )}
            <button
              type="button"
              className="quiet-button"
              onClick={() => {
                session.leave();
              }}
            >
              {t('Leave the voice')}
            </button>
          </div>
          {shown.noMicrophone && (
            <p className="authoring-notice" role="status">
              {t(
                'The browser did not allow the microphone: you listen only. Allow it in the site’s settings in the browser, then join again.',
              )}
            </p>
          )}
          {mutedByDm && (
            <p className="authoring-notice" role="status">
              {t('The DM muted you.')}
            </p>
          )}
          {!shown.relayed && (
            <p className="muted">
              {t('Without a relay, voices reach only the screens that can reach each other.')}
            </p>
          )}
          {shown.microphones.length > 1 && (
            <div className="field">
              <label htmlFor={`${ids}-microphone`}>{t('Microphone')}</label>
              <select
                id={`${ids}-microphone`}
                value={shown.microphone ?? ''}
                onChange={(event) => {
                  session.choose(event.target.value);
                }}
              >
                {shown.microphone === null && (
                  <option value="">{t('As the device chooses')}</option>
                )}
                {shown.microphones.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || t('Microphone {number}', { number: index + 1 })}
                  </option>
                ))}
              </select>
            </div>
          )}
          <label className="dice-toggle">
            <input
              type="checkbox"
              checked={shown.sameRoom}
              onChange={(event) => {
                session.setSameRoom(event.target.checked);
              }}
            />
            <span>{t('This screen shares a room with another: play no voices here')}</span>
          </label>
          <ul className="voice-peers" aria-label={t('In the voice')}>
            {peers.map((peer) => {
              const heard = shown.heard.get(peer.peerId);
              const self = peer.peerId === me;
              const name = self ? t('You') : peer.dm ? t('The DM') : (peer.name ?? t('A player'));
              return (
                <li
                  key={peer.peerId}
                  className={`voice-peer${heard?.talking ? ' is-talking' : ''}`}
                  data-peer={peer.peerId}
                  data-state={self ? 'self' : (heard?.state ?? 'new')}
                  data-hearing={heard?.hearing ? 'true' : 'false'}
                >
                  <span className="voice-name">{name}</span>
                  <span className="muted">
                    {peer.muted
                      ? t('muted by the DM')
                      : heard?.talking
                        ? t('talking')
                        : self || heard?.state === 'connected'
                          ? ''
                          : t('connecting…')}
                  </span>
                  {isDm && !self && (
                    <span className="action-row">
                      <button
                        type="button"
                        className="quiet-button"
                        aria-label={
                          peer.muted
                            ? t('Let talk: {name}', { name })
                            : t('Mute for everyone: {name}', { name })
                        }
                        onClick={() => {
                          session.muteFor(peer.peerId, !peer.muted);
                        }}
                      >
                        {peer.muted ? t('Let talk') : t('Mute for everyone')}
                      </button>
                      <button
                        type="button"
                        className="quiet-button"
                        aria-label={t('Remove from the voice: {name}', { name })}
                        onClick={() => {
                          session.remove(peer.peerId);
                        }}
                      >
                        {t('Remove from the voice')}
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
