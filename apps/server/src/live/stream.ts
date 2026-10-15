import type { ServerResponse } from 'node:http';

import type { LiveMessage } from '@ltw/contracts';

/**
 * Event-stream framing of the live signal (docs/STAGE_310_DESIGN.md §A): the fixed messages
 * and a comment heartbeat, nothing else. A sink is one subscriber's connection.
 */
export function frame(message: LiveMessage): string {
  switch (message.type) {
    case 'ready':
      return 'event: ready\ndata: {}\n\n';
    case 'changed':
      return `event: changed\ndata: ${JSON.stringify({ seq: message.seq })}\n\n`;
    case 'closed':
      return `event: closed\ndata: ${JSON.stringify({ reason: message.reason })}\n\n`;
  }
}

export const HEARTBEAT = ': heartbeat\n\n';

/** Response headers of an open stream (the app's `onSend` hook does not run for it). */
export const STREAM_HEADERS: Readonly<Record<string, string>> = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-store',
  vary: 'Authorization',
  'x-content-type-options': 'nosniff',
  // Proxies must pass each frame on as it is written.
  'x-accel-buffering': 'no',
};

export interface LiveSink {
  write(text: string): void;
  /** Bytes written but not yet handed to the network: a slow consumer's backlog. */
  unsent(): number;
  /** Ends the stream after what was written. */
  end(): void;
  /** Drops the connection without waiting for the backlog. */
  destroy(): void;
  /** Called once when the connection closes, for any reason, including before this call. */
  onClose(listener: () => void): void;
}

export function responseSink(raw: ServerResponse): LiveSink {
  return {
    write: (text) => {
      if (!raw.writableEnded && !raw.destroyed) raw.write(text);
    },
    unsent: () => raw.writableLength,
    end: () => {
      if (!raw.writableEnded && !raw.destroyed) raw.end();
    },
    destroy: () => {
      raw.destroy();
    },
    onClose: (listener) => {
      if (raw.destroyed || raw.writableFinished || raw.socket?.destroyed === true) {
        queueMicrotask(listener);
      } else {
        raw.once('close', listener);
      }
    },
  };
}
