import assert from 'node:assert/strict';
import { chromium, webkit, expect } from '@playwright/test';

const url = process.argv[2] || 'http://127.0.0.1:4187/index.html';
const engine = process.argv[3] === 'webkit' ? webkit : chromium;
const browser = await engine.launch();
const b = (page, name) => page.getByRole('button', { name, exact: true });
const errors = [];
try {
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dm = await desk.newPage();
  const contexts = [];
  const listen = (p) =>
    p.on('pageerror', (e) =>
      errors.push({ page: new URL(p.url()).pathname, error: e.message, stack: e.stack }),
    );
  listen(dm);
  await dm.goto(url + '#players');
  await expect(b(dm, 'Подключить телефоны по Wi-Fi')).toBeVisible();
  async function seat(hero) {
    const windowReady = dm.waitForEvent('popup');
    await dm.locator('[data-open-seat="' + hero + '"]').click();
    const invitation = await windowReady;
    await invitation.waitForLoadState();
    const href = invitation.url();
    await invitation.close();
    // A separate browser profile, as on another device. No opener, cookies or shared localStorage.
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    contexts.push(ctx);
    const player = await ctx.newPage();
    listen(player);
    const files = new Set();
    player.on('request', (r) => files.add(new URL(r.url()).pathname));
    await player.goto(href);
    await expect(player.locator('.seat-connection')).toHaveText('За столом');
    const seatKey = new URLSearchParams(new URL(href).hash.slice(1)).get('seat');
    const endpoint = new URL('/_players/', href).href;
    const auth = { Authorization: 'Bearer ' + seatKey };
    const read = async () =>
      (await (await ctx.request.get(endpoint + 'seat', { headers: auth })).json()).view;
    const send = (id, extra = {}) =>
      ctx.request.post(endpoint + 'roll', { headers: auth, data: { id, ...extra } });
    return { page: player, href, ctx, read, send, files, endpoint, auth };
  }
  const asya = await seat('asya'),
    tess = await seat('tess'),
    finn = await seat('finn'),
    p = asya.page;
  const finnInvite = finn.page.url();
  await finn.page.locator('.skip').focus();
  await finn.page.keyboard.press('Enter');
  assert.equal(finn.page.url(), finnInvite);
  await finn.page.reload();
  await expect(finn.page.locator('.seat-connection')).toHaveText('За столом');
  await b(finn.page, 'Мой герой').click();
  await expect(finn.page.locator('.hero-image img')).toHaveAttribute(
    'src',
    'art/portrait-finn.webp',
  );
  await b(finn.page, 'За столом').click();
  assert.equal(new URL(asya.href).hostname, 'localhost');
  assert.deepEqual((await asya.read()).cards, []);
  for (const path of [
    '/index.html',
    '/data/cast.generated.js',
    '/data/materials.generated.js',
    '/director.js',
    '/data/act-1.generated.js',
  ]) {
    assert.equal((await asya.ctx.request.get(new URL(path, asya.href).href)).status(), 404);
  }
  await b(p, 'Мой герой').click();
  await expect(p.locator('.hero-image img')).toHaveAttribute('src', 'art/portrait-asya.webp');
  await b(p, 'Фигурка').click();
  await expect(p.locator('.hero-image img')).toHaveAttribute('src', 'art/mini-asya.webp');
  await dm.goto(url + '#book/6/1');
  const tvOpened = dm.waitForEvent('popup');
  await b(dm, 'Показать место на телевизоре').click();
  const tv = await tvOpened;
  listen(tv);
  await expect(tv.locator('.show-place h1')).toHaveText('Облачная Кузница');
  await b(dm, 'Запросить проверку').click();
  await dm.locator('#check-hero').selectOption('asya');
  const skill = await dm.locator('#check-skill option:checked').textContent();
  const dc = Number(skill.match(/Сл (\d+)/)[1]);
  await b(dm, 'Попросить игрока бросить').click();
  await expect(p.locator('#summons button')).toBeVisible();
  await p.locator('#summons button').click();
  const dice = p.locator('.dice-stage');
  await expect(dice).toHaveAttribute('data-state', 'ready');
  const pending = (await asya.read()).checks[0];
  assert.deepEqual(
    Object.keys(pending).sort(),
    ['id', 'label', 'bonus', 'created', 'status'].sort(),
  );
  assert.deepEqual((await tess.read()).checks, []);
  assert.equal((await tess.send(pending.id)).status(), 404);
  await expect(b(tess.page, 'Бросить d20')).toHaveCount(0);
  await expect(dm.locator('.check-result')).toHaveCount(0);
  await expect(tv.locator('.show-place h1')).toHaveText('Облачная Кузница');
  // Reread the still-pending invitation and throw by dragging on the real 3D tabletop.
  await p.reload();
  await expect(dice).toHaveAttribute('data-state', 'ready');
  const box = await dice.boundingBox();
  assert.ok(box);
  await p.mouse.move(box.x + box.width * 0.22, box.y + box.height * 0.72);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width * 0.76, box.y + box.height * 0.32, { steps: 8 });
  await p.mouse.up();
  await expect(dice).toHaveAttribute('data-state', 'rolling', { timeout: 9000 });
  await expect(dice).toHaveAttribute('data-state', 'settled', { timeout: 12000 });
  const result = (await asya.read()).checks[0];
  assert.equal(result.id, pending.id);
  assert.equal(result.face, Number(await dice.getAttribute('data-face')));
  assert.equal(result.total, result.face + pending.bonus);
  assert.equal(await p.locator('.roll-receipt strong').textContent(), String(result.total));
  assert.ok(
    !Object.hasOwn(result, 'dc') &&
      !Object.hasOwn(result, 'passed') &&
      !Object.hasOwn(result, 'scene'),
  );
  await expect(dm.locator('.check-result')).toContainText(
    result.total >= dc ? 'Проверка пройдена' : 'Осложнение',
  );
  await expect(dm.locator('.check-result')).toContainText('d20 (' + result.face + ')');
  await expect(tv.locator('.show-place h1')).toBeVisible();
  await Promise.all([asya.send(pending.id, { face: 99 }), asya.send(pending.id)]);
  await p.reload();
  await b(p, 'Журнал').click();
  await expect(p.locator('.roll-log li')).toHaveCount(1);
  await expect(p.locator('.roll-log b')).toHaveText(String(result.total));
  await expect(p.locator('body')).not.toContainText('Сложность');
  // Results stay with their original page after the DM navigates and the player reconnects.
  await dm.goto(url + '#book/6/2');
  await dm.reload();
  await dm.goto(url + '#check/6/1/asya');
  await expect(dm.locator('.check-result')).toContainText('d20 (' + result.face + ')');
  await b(dm, 'Попросить новый бросок').click();
  await expect(p.locator('#summons button')).toBeVisible();
  const second = (await asya.read()).checks.find((c) => c.status === 'pending');
  await b(dm, 'Отозвать запрос').click();
  await expect(p.locator('#summons button')).toHaveCount(0);
  assert.equal((await asya.send(second.id)).status(), 404);
  await dm.goto(url + '#players');
  await dm.locator('[data-index-check="' + pending.id + '"] a').click();
  await expect(dm.locator('.check-result')).toContainText('d20 (' + result.face + ')');
  await dm.goto(url + '#book/6/1');
  await b(dm, 'Раздатка').click();
  assert.equal((await asya.read()).cards.length, 0);
  const windowsBefore = desk.pages().length;
  await b(dm, 'Выдать раздатку игрокам').click();
  await expect(p.locator('.journal-leaf summary')).toHaveText('Четыре независимых сигнала');
  assert.equal(desk.pages().length, windowsBefore);
  await dm.goto(url + '#battle/workshop-repairer');
  await b(dm, 'На телевизор').click();
  await b(p, 'За столом').click();
  await b(p, 'К общему столу').click();
  await expect(p.locator('.pocket-board .piece')).toHaveCount(4);
  await b(p, 'Развернуть поле боя').click();
  await expect(b(p, 'Свернуть поле боя')).toBeVisible();
  const field = await p.locator('.pocket-board').boundingBox();
  assert.ok(field.width >= 300 && Math.abs(field.width / field.height - 1.25) < 0.02);
  await b(dm, 'Следующий ход').click();
  await b(dm, 'Следующий ход').click();
  await expect(p.locator('#turn-signal')).toContainText('Ваш ход');
  await expect(tess.page.locator('#turn-signal')).toContainText('Ходит Ася');
  await b(p, 'Свернуть поле боя').click();
  await dm.locator('.turn-entry[data-piece="asya"]').click();
  await dm.locator('[name="hp"]').fill('19');
  await dm.locator('[name="condition"]').fill('Тайная запись мастера');
  await b(dm, 'Сохранить состояние').click();
  await expect(p.locator('.pocket-stats')).toContainText('19 / 24');
  assert.ok(!JSON.stringify(await asya.read()).includes('Тайная запись мастера'));
  assert.equal((await tess.read()).hp, 24);
  await dm.keyboard.press('Escape');
  assert.deepEqual(
    (await asya.read()).checks.map((c) => c.id),
    [pending.id],
  );
  const packet = await asya.read();
  assert.ok(packet.show.frame.pieces.every((piece) => !Object.hasOwn(piece, 'hp')));
  assert.equal(packet.atlas, null);
  for (const file of asya.files)
    assert.ok(!/data\/(cast|materials|act-)|director\.js|edition\.js/.test(file), file);
  // A private request must remain actionable on the expanded battlefield.
  await b(tess.page, 'Развернуть поле боя').click();
  await dm.goto(url + '#check/6/1/tess');
  await b(dm, 'Попросить игрока бросить').click();
  const summons = tess.page.getByRole('button', { name: /Мастер просит бросок/ });
  await summons.click({ timeout: 6000 });
  await b(tess.page, 'К полю боя').click();
  await summons.click();
  await expect(finn.page.locator('#summons button')).toHaveCount(0);
  await dm.goto(url + '#book/6/2');
  await tess.page.emulateMedia({ reducedMotion: 'reduce' });
  const action = b(tess.page, 'Бросить d20');
  await expect(action).toBeVisible();
  await action.focus();
  await tess.page.keyboard.press('Enter');
  await expect(tess.page.locator('.dice-stage')).toHaveAttribute('data-state', 'settled', {
    timeout: 9000,
  });
  await b(tess.page, 'К общему столу').click();
  await b(tess.page, 'Свернуть поле боя').click({ trial: true });
  await expect(tess.page.locator('.pocket-board .piece')).toHaveCount(4);
  await expect(dm.getByRole('dialog')).not.toBeVisible();
  // A browser without the native fullscreen API uses the same field, including cancellation.
  await finn.page.locator('#player-main').evaluate((main) => {
    Object.defineProperty(main, 'requestFullscreen', { value: undefined, configurable: true });
  });
  await b(finn.page, 'Развернуть поле боя').click();
  await dm.goto(url + '#check/6/1/finn');
  await b(dm, 'Попросить игрока бросить').click();
  await finn.page.getByRole('button', { name: /Мастер просит бросок/ }).click();
  await expect(b(finn.page, 'Бросить d20')).toBeVisible();
  await b(dm, 'Отозвать запрос').click();
  await b(finn.page, 'Свернуть поле боя').click({ trial: true });
  await finn.page.keyboard.press('Escape');
  await expect(b(finn.page, 'Развернуть поле боя')).toBeVisible();
  await dm.goto(url + '#check/6/1/tess');
  await expect(dm.locator('.check-result')).toBeVisible();
  assert.equal((await asya.read()).checks.length, 1);
  await b(dm, 'Показать итог игрокам').click();
  await expect(p.locator('.pocket-frame .public-total')).toBeVisible();
  await finn.page.goto(asya.href);
  await expect(finn.page.locator('#identity h1')).toHaveText('Ася Вереск');
  await expect(finn.page.locator('.seat-connection')).toHaveText('За столом');
  const offline = await browser.newContext({ reducedMotion: 'reduce' });
  const book = await offline.newPage();
  listen(book);
  await book.goto(new URL('index.html#check/6/1/asya', import.meta.url).href);
  await b(book, 'Попросить игрока бросить').click();
  const opened = book.waitForEvent('popup');
  await b(book, 'Открыть экран игрока').click();
  const personal = await opened;
  listen(personal);
  await expect(personal.locator('.seat-connection')).toHaveText('За столом');
  await b(personal, 'Бросить d20').click();
  await expect(book.locator('.check-result')).toContainText('Сложность');
  await expect(personal.locator('.roll-receipt strong')).toBeVisible();
  await offline.close();
  assert.deepEqual(errors, []);
  process.stdout.write(
    'Три личных приглашения, закрытая сложность, ответ на развёрнутом поле боя, d20 жестом и клавишей, возврат итога, отмена и выдача раздатки проверены.\n',
  );
  for (const c of contexts) await c.close();
} finally {
  await browser.close();
}
