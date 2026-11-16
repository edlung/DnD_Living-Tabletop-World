import type { Connect, HotPayload, Plugin } from 'vite';

/**
 * What the dev server tells its pages, and when a page comes back to it, written to the server's
 * output — only where `LTW_DEV_TRACE` is set (the browser tests in CI, `playwright.config.ts`).
 * A page of the dev server reloads itself for three reasons the journeys cannot see: the server
 * says `full-reload`, the server sends an `error` (an overlay over the page), or the page's own
 * connection to the server closed and its `vite-ping` then found the server again. Each is one
 * line here, with the time, so a journey that lost its page can be read against them. Nothing of
 * a request is written but the engine's family: no address, no header, no body.
 */
const stamp = () => new Date().toISOString().slice(11, 23);
const engine = (agent: string | undefined) =>
  agent === undefined
    ? 'unknown'
    : agent.includes('Chrome')
      ? 'chromium'
      : agent.includes('AppleWebKit')
        ? 'webkit'
        : 'other';

export function devTrace(): Plugin {
  return {
    name: 'ltw:dev-trace',
    apply: 'serve',
    configureServer(server) {
      if (process.env['LTW_DEV_TRACE'] === undefined) return;
      const say = (what: string) => {
        server.config.logger.info(`[ltw:trace] ${stamp()} ${what}`);
      };
      let opened = 0;
      server.ws.on('connection', (socket, request) => {
        const id = (opened += 1);
        const from = engine(request.headers['user-agent']);
        const since = Date.now();
        socket.on('close', (code) => {
          // 1001 is a page leaving (closed, or gone to another address): the usual end.
          if (code === 1001) return;
          const lived = String(Date.now() - since);
          say(`ws closed #${String(id)} ${from} code=${String(code)} after=${lived}ms`);
        });
      });
      // A page asks with `vite-ping` only after it lost its connection and before it reloads.
      server.httpServer?.on('upgrade', (request: Connect.IncomingMessage) => {
        if (request.headers['sec-websocket-protocol'] !== 'vite-ping') return;
        say(`ping after a lost connection: ${engine(request.headers['user-agent'])}`);
      });
      const hot = server.environments.client.hot;
      const send = hot.send.bind(hot);
      const told = (payload: HotPayload) => {
        const pages = String(server.ws.clients.size);
        if (payload.type === 'full-reload') {
          say(`full-reload to ${pages} pages, by ${payload.triggeredBy ?? 'the server'}`);
        } else if (payload.type === 'error') {
          say(`error to ${pages} pages: ${payload.err.message.slice(0, 300)}`);
        }
      };
      hot.send = (first: HotPayload | string, data?: unknown) => {
        if (typeof first === 'string') {
          send(first, data);
          return;
        }
        told(first);
        send(first);
      };
    },
  };
}
