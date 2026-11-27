// Local pilot only. A seat can read its own view and ask its DM to roll one outstanding check.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('./', import.meta.url);
const port = Number(process.argv[2] ?? 4187);
const heroes = ['finn', 'tess', 'asya'];
const token = (s) => typeof s === 'string' && /^[0-9a-f]{40}$/.test(s);
const rooms = new Map(),
  assignments = new Map();
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
};
const playerFiles = new Set([
  'player.html',
  'player.js',
  'player-roll.js',
  'player-wire.js',
  'player-table.css',
  'player.css',
  'base.css',
  'dice.css',
  'public-scenes.js',
  'public-scenes.css',
  'public-board.js',
  'board.css',
  'icons.js',
  'dice-assets.js',
  'data/player-heroes.generated.js',
  'data/miniature-bases.generated.css',
  'runtime/dice3d.min.js',
]);
const publicAsset = (path) =>
  /^(?:fonts\/[a-z0-9-]+\.woff2|art\/(?:portrait-[a-z]+|mini-[a-z]+|map-[a-z]+|place-[a-z]+|forge-anvil|forge-hammer|moment|archipelago|desk|vellum|plaque|leaf-right|item-d20(?:-face)?|item-seal)\.webp)$/.test(
    path,
  );
const local = new Set(['127.0.0.1:' + port, 'localhost:' + port]);
let lan, opening;
function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
async function body(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 300_000) throw new Error('too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
function validSeatView(view, hero) {
  return (
    view?.hero === hero &&
    Array.isArray(view.checks) &&
    view.checks.length <= 600 &&
    view.checks.every((c) => token(c.id) && ['pending', 'answered'].includes(c.status)) &&
    Array.isArray(view.cards) &&
    view.cards.length <= 20
  );
}
function syncHost(key, packet) {
  const { keys, views } = packet;
  if (
    !keys ||
    !heroes.every((h) => token(keys[h])) ||
    new Set(heroes.map((h) => keys[h])).size !== heroes.length
  )
    return null;
  let room = rooms.get(key);
  if (!room) {
    if (heroes.some((h) => assignments.has(keys[h]))) return null;
    room = { keys, views: {}, intents: new Map(), seen: {}, time: Date.now() };
    rooms.set(key, room);
    for (const hero of heroes) assignments.set(keys[hero], { room, hero });
  }
  if (!heroes.every((h) => keys[h] === room.keys[h])) return null;
  if (views) {
    if (!heroes.every((h) => validSeatView(views[h], h))) return null;
    room.views = views;
    for (const [id, hero] of room.intents)
      if (!views[hero].checks.some((check) => check.id === id && check.status === 'pending'))
        room.intents.delete(id);
  }
  room.time = Date.now();
  return {
    needsViews: !room.views.asya,
    intents: [...room.intents].map(([id, hero]) => ({ id, hero })),
    online: heroes.filter((h) => Date.now() - room.seen[h] < 9000),
    lan: room.network ? (lan?.url ?? null) : null,
  };
}
function privateIP() {
  const rows = Object.entries(networkInterfaces()).flatMap(([name, entries]) =>
    entries.map((entry) => ({ ...entry, name })),
  );
  return rows
    .filter(
      (e) =>
        !e.internal &&
        e.family === 'IPv4' &&
        /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(e.address),
    )
    .sort(
      (a, b) => Number(/^en\d|^eth|^wl/.test(b.name)) - Number(/^en\d|^eth|^wl/.test(a.name)),
    )[0]?.address;
}
async function openLAN() {
  if (lan) return lan.url;
  if (opening) return opening;
  const address = privateIP();
  if (!address) return null;
  const listener = createServer((req, res) => serve(req, res, true));
  opening = new Promise((resolve) => {
    listener.once('error', () => resolve(null));
    listener.listen(port, address, () => {
      lan = { url: 'http://' + address + ':' + port, listener };
      resolve(lan.url);
    });
  });
  try {
    return await opening;
  } finally {
    opening = null;
  }
}
async function serve(req, res, guest) {
  try {
    const onNetwork = guest;
    const authority = req.headers.host;
    if (guest ? 'http://' + authority !== lan?.url : !local.has(authority))
      return json(res, 403, {});
    guest ||= authority === 'localhost:' + port;
    const path =
      new URL(req.url, 'http://local').pathname.slice(1) || (guest ? 'player.html' : 'index.html');
    if (path.startsWith('_players/')) {
      const origin = req.headers.origin;
      if (
        origin &&
        origin !== 'http://' + authority &&
        (guest || !['http://localhost:4186', 'http://127.0.0.1:4186'].includes(origin))
      )
        return json(res, 403, {});
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      }
      if (req.method === 'OPTIONS') return json(res, 200, {});
      const key = req.headers.authorization?.replace(/^Bearer /, '');
      if (!token(key)) return json(res, 403, {});
      if (!guest && path === '_players/host' && req.method === 'POST') {
        const result = syncHost(key, await body(req));
        return json(res, result ? 200 : 400, result ?? {});
      }
      if (!guest && path === '_players/lan' && req.method === 'POST' && rooms.has(key)) {
        const room = rooms.get(key);
        const { enable } = await body(req);
        if (typeof enable !== 'boolean') return json(res, 400, {});
        if (!enable) {
          room.network = false;
          if (lan && ![...rooms.values()].some((r) => r.network)) {
            lan.listener.close();
            lan = null;
          }
          return json(res, 200, { url: null });
        }
        const url = await openLAN();
        room.network = !!url;
        return json(res, url ? 200 : 503, { url });
      }
      const seat = assignments.get(key);
      if (!seat?.room.views[seat.hero]) return json(res, 404, {});
      const { room, hero } = seat;
      if (onNetwork && !room.network) return json(res, 403, {});
      const online = Date.now() - room.time < 12000;
      if (path === '_players/seat' && req.method === 'GET') {
        room.seen[hero] = Date.now();
        return json(res, 200, { view: room.views[hero], online });
      }
      if (path === '_players/roll' && req.method === 'POST') {
        const { id } = await body(req);
        const check = room.views[hero].checks.find((c) => c.id === id);
        if (!check) return json(res, 404, {});
        if (!online) return json(res, 409, {});
        if (check.status === 'pending') room.intents.set(id, hero);
        return json(res, 200, { accepted: true });
      }
      return json(res, 404, {});
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, {});
    if (
      !/^[a-zA-Z0-9_./-]+$/.test(path) ||
      path.split('/').some((p) => p.startsWith('.')) ||
      !Object.hasOwn(contentTypes, extname(path)) ||
      (guest && !playerFiles.has(path) && !publicAsset(path))
    )
      return json(res, 404, {});
    const file = fileURLToPath(new URL(path, root));
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) return json(res, 404, {});
    res.writeHead(200, {
      'Content-Type': contentTypes[extname(path)],
      'Content-Length': info.size,
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file)
      .on('error', () => res.destroy())
      .pipe(res);
  } catch {
    if (!res.headersSent) json(res, 400, {});
    else res.end();
  }
}
const server = createServer((req, res) => serve(req, res, false));
server.listen(port, '127.0.0.1', () =>
  process.stdout.write('Local Lighthouse table at http://127.0.0.1:' + port + '\n'),
);
