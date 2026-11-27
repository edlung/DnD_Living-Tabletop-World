// Start the real web client and an isolated, in-memory campaign. Both listeners are loopback only.
import { fork, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../../', import.meta.url));
const port = Number(process.env['LTW_LIGHTHOUSE_PORT'] || 4326);
if (!Number.isInteger(port) || port < 1024 || port > 65534) throw new Error('Invalid local port');
const origin = 'http://127.0.0.1:' + String(port);
const env = {
  ...process.env,
  LTW_UI_SIGN_IN_SEED: randomBytes(32).toString('hex'),
  LTW_UI_SIGN_IN_WEB_PORT: String(port),
  LTW_UI_SIGN_IN_API_PORT: String(port + 1),
  LTW_API_TARGET: 'http://127.0.0.1:' + String(port + 1),
  LTW_VITE_NO_RELOAD: '1',
  LTW_VITE_CACHE_DIR: 'node_modules/.vite-lighthouse-' + String(port),
};
const api = fork('apps/server/src/testing/ui-sign-in-server.ts', ['--lighthouse-rehearsal'], {
  cwd,
  env,
  execArgv: ['--conditions=@ltw/source'],
});
const web = spawn(
  'pnpm',
  ['dev:web', '--host', '127.0.0.1', '--strictPort', '--port', String(port)],
  { cwd, env, stdio: 'inherit' },
);
const stop = () => {
  api.kill();
  web.kill();
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
for (const child of [api, web])
  child.once('exit', (code) => {
    stop();
    process.exitCode = code ?? 0;
  });
async function showLinks(player: string, dm: string) {
  for (let tries = 0; tries < 120; tries++) {
    if (
      await fetch(origin).then(
        (r) => r.ok,
        () => false,
      )
    ) {
      process.stdout.write(`\nИгрок: ${player}\nМастер (в другом профиле браузера): ${dm}\n\n`);
      return;
    }
    await delay(250);
  }
  stop();
  throw new Error('The main client did not start');
}
api.once('message', (message: unknown) => {
  if (
    typeof message !== 'object' ||
    !message ||
    !('player' in message) ||
    typeof message.player !== 'string' ||
    !('dm' in message) ||
    typeof message.dm !== 'string'
  ) {
    stop();
    return;
  }
  void showLinks(message.player, message.dm).catch(() => {
    process.stderr.write('Не удалось открыть локальный стол.\n');
    process.exitCode = 1;
  });
});
