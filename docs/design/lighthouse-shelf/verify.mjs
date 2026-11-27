/* global window, document -- the evaluate callbacks below execute in the two browser windows. */
import assert from 'node:assert/strict';
import { chromium, expect, webkit } from '@playwright/test';

const url = process.argv[2] || new URL('index.html', import.meta.url).href;
const browser = await (process.argv[3] === 'webkit' ? webkit : chromium).launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  context.on('request', (r) => requests.push(r.url()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.sentToTable = [];
    const post = MessagePort.prototype.postMessage;
    MessagePort.prototype.postMessage = function (packet, ...args) {
      if (packet?.kind === 'board')
        window.sentToTable.push(JSON.parse(JSON.stringify(packet.frame)));
      return post.call(this, packet, ...args);
    };
  });
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Книжная полка' })).toBeVisible();
  await expect(page.locator('.volume-ledger')).toContainText('Сцена 3 из 3');
  await page.getByRole('link', { name: 'Продолжить с закладки' }).click();
  await expect(page.locator('h1')).toHaveText('Упрямый автомат и три проекта');
  await page.getByRole('button', { name: 'Персонажи', exact: true }).click();
  await page.locator('[data-person="asya"]').click();
  await expect(page.locator('.character-plate img')).toHaveAttribute(
    'src',
    'art/portrait-asya.webp',
  );
  await page.getByRole('button', { name: 'Фигурка', exact: true }).click();
  await expect(page.locator('.character-plate img')).toHaveAttribute('src', 'art/mini-asya.webp');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Персонажи', exact: true })).toBeFocused();
  await page.locator('.person-chip').first().click();
  await page.locator('.private-detail summary').click();
  const secret = await page.locator('.private-detail p').first().textContent();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Заметки', exact: true }).click();
  const note = 'Личная заметка на полях шестой главы';
  await page.locator('textarea').fill(note);
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: 'Заметки', exact: true }).click();
  await expect(page.locator('textarea')).toHaveValue(note);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Кубики', exact: true }).click();
  await page.getByRole('button', { name: 'd6', exact: true }).click();
  const desk = page.locator('.dice-stage');
  await expect(desk).toHaveAttribute('data-renderer', /^(webgl|canvas3d)$/);
  await page.getByRole('button', { name: 'Бросить d6' }).click();
  await expect(desk).toHaveAttribute('data-state', 'settled', { timeout: 10000 });
  const pips = await desk.getAttribute('data-face');
  assert.match(pips, /^[1-6]$/);
  await expect(page.locator('.dice-result')).toHaveText('Выпало ' + pips + ' на d6');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Открыть поле боя' }).click();
  await expect(page.locator('.combat-screen')).toBeVisible();
  const viewport = page.viewportSize();
  const mapArea = await page.locator('.map-scroll').boundingBox();
  const order = await page.locator('.initiative').boundingBox();
  const paper = await page.locator('.battle-map').boundingBox();
  assert.ok(order.y + order.height <= mapArea.y + 1);
  assert.ok(paper.width >= viewport.width - 2);
  assert.ok(Math.abs(paper.width / 10 - paper.height / 8) < 1);
  const mapScroll = page.locator('.map-scroll');
  const start = await mapScroll.evaluate((el) => el.scrollTop);
  await page.mouse.move(viewport.width * 0.5, viewport.height * 0.62);
  await page.mouse.down();
  await page.mouse.move(viewport.width * 0.5, viewport.height * 0.52, { steps: 5 });
  await page.mouse.up();
  assert.ok((await mapScroll.evaluate((el) => el.scrollTop)) > start);
  await page.getByRole('button', { name: 'Увеличить карту' }).click();
  await expect(page.locator('.zoom-value')).toHaveText('125%');
  await page.getByRole('button', { name: 'Показать всю карту' }).click();
  const overview = await page.locator('.battle-map').boundingBox();
  assert.ok(overview.width <= mapArea.width + 1 && overview.height <= mapArea.height + 1);
  await page.getByRole('button', { name: 'Развернуть карту' }).click();
  await expect(page.locator('.zoom-value')).toHaveText('100%');
  await page
    .getByRole('button', { name: 'Очередь', exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.locator('.initiative')).toBeHidden();
  await page
    .getByRole('button', { name: 'Очередь', exact: true })
    .filter({ visible: true })
    .click();
  const popup = context.waitForEvent('page');
  await page.getByRole('button', { name: 'На телевизор' }).click();
  const tv = await popup;
  await tv.bringToFront();
  tv.on('pageerror', (e) => errors.push(e.message));
  await expect(tv.locator('.initiative [aria-current="step"] strong')).toHaveText('Финн');
  const tvOrder = await tv.locator('.initiative').boundingBox();
  const tvStage = await tv.locator('.tv-stage').boundingBox();
  const tvBoard = await tv.locator('.battle-map').boundingBox();
  assert.ok(tvOrder.y + tvOrder.height <= tvStage.y + 1);
  assert.ok(tvBoard.width >= tv.viewportSize().width - 2);
  if (await tv.evaluate(() => document.fullscreenEnabled)) {
    await tv.getByRole('button', { name: 'На весь экран' }).click();
    await expect.poll(() => tv.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await tv.getByRole('button', { name: 'Выйти из полного экрана' }).click();
  }
  await page.bringToFront();
  await page.getByRole('button', { name: 'Переставить фигурку' }).click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('#notice')).toContainText('занята');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect
    .poll(() => tv.locator('.piece.acting').evaluate((x) => x.style.getPropertyValue('--x')))
    .toBe('2');
  await page.getByRole('button', { name: 'Жетоны' }).click();
  await expect(tv.locator('.medallion')).toHaveCount(4);
  await page.getByRole('button', { name: 'Сетка', exact: true }).click();
  await expect(tv.locator('.gridded')).toHaveCount(0);
  for (let i = 0; i < 2; i++)
    await page.getByRole('button', { name: 'Следующий ход', exact: true }).click();
  await expect(tv.locator('.medallion.acting img')).toHaveAttribute(
    'src',
    'art/portrait-asya.webp',
  );
  await page.getByRole('button', { name: 'Жетоны' }).click();
  await expect(tv.locator('.sculpt.acting img')).toHaveAttribute('src', 'art/mini-asya.webp');
  await page.getByRole('button', { name: 'Переставить фигурку' }).click();
  for (let row = 4; row < 7; row++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect
    .poll(() => tv.locator('.piece.acting').evaluate((p) => p.style.getPropertyValue('--y')))
    .toBe('7');
  const allOnScreen = await tv.locator('.piece').evaluateAll((pieces) => {
    const area = document.querySelector('.tv-stage').getBoundingClientRect();
    return pieces.every((p) => {
      const b = p.getBoundingClientRect();
      return (
        b.top >= area.top - 1 &&
        b.left >= area.left - 1 &&
        b.bottom <= area.bottom + 1 &&
        b.right <= area.right + 1
      );
    });
  });
  assert.ok(allOnScreen);
  await page.getByRole('button', { name: 'Кубики', exact: true }).click();
  await page.getByRole('button', { name: 'd20', exact: true }).click();
  await page.getByRole('button', { name: 'Бросить d20' }).click();
  await expect(desk).toHaveAttribute('data-state', 'settled', { timeout: 10000 });
  const result = await desk.getAttribute('data-face');
  assert.match(result, /^(?:[1-9]|1[0-9]|20)$/);
  await expect(page.locator('.dice-result')).toHaveText('Выпало ' + result + ' на d20');
  assert.ok(!(await tv.locator('body').innerText()).includes('Выпало'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Бросить d20' }).click();
  await expect(desk).toHaveAttribute('data-state', 'settled');
  await expect(page.locator('.dice-result')).toContainText('Выпало');
  await page.keyboard.press('Escape');
  for (let i = 0; i < 2; i++)
    await page.getByRole('button', { name: 'Следующий ход', exact: true }).click();
  await expect(tv.locator('.tv-round')).toHaveText('Раунд 2');
  await page.getByRole('link', { name: 'К книге' }).click();
  await page.getByRole('button', { name: 'Оглавление', exact: true }).click();
  await page.locator('a[href="#book/4/1"]').click();
  await expect(page.locator('h1')).toHaveText('Поймать библиотечный прилив');
  await page.getByRole('button', { name: 'Заметки', exact: true }).click();
  await expect(page.locator('textarea')).toHaveValue('');
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'На полку' }).click();
  await expect(page.locator('.volume-ledger')).toContainText('Упрямый автомат и три проекта');
  await expect(tv.locator('.tv-turn h1')).toHaveText('Облачная Кузница');
  const frames = await page.evaluate(() => window.sentToTable);
  assert.ok(frames.length >= 6);
  for (const frame of frames) {
    assert.deepEqual(Object.keys(frame).sort(), [
      'active',
      'grid',
      'map',
      'mode',
      'pieces',
      'place',
      'round',
    ]);
    for (const actor of frame.pieces)
      assert.deepEqual(Object.keys(actor).sort(), [
        'figure',
        'id',
        'name',
        'portrait',
        'short',
        'side',
        'x',
        'y',
      ]);
  }
  const publicText = (await tv.locator('body').innerText()) + JSON.stringify(frames);
  assert.ok(!publicText.includes(note) && !publicText.includes(secret));
  const publicFiles = await tv
    .locator('script[src]')
    .evaluateAll((nodes) => nodes.map((el) => el.getAttribute('src')));
  assert.deepEqual(publicFiles, [
    'icons.js',
    'public-board.js',
    'public-scenes.js',
    'forge-sound.js',
    'dice-assets.js',
    'tv-roll.js',
    'table.js',
  ]);
  await page.getByRole('button', { name: 'Остановить показ' }).click();
  await expect(tv.locator('.tv-idle')).toBeVisible();
  await expect(tv.locator('.piece')).toHaveCount(0);
  await page.getByRole('button', { name: 'Оглавление', exact: true }).click();
  await page.locator('a[href="#book/4/1"]').click();
  await page.getByRole('button', { name: 'Положить закладку сюда' }).click();
  await page.getByRole('link', { name: 'На полку' }).click();
  await page.reload();
  await expect(page.locator('.volume-ledger')).toContainText('Поймать библиотечный прилив');
  assert.deepEqual(errors, []);
  assert.ok(requests.every((request) => new URL(request).origin === new URL(url).origin));
  process.stdout.write(
    'Полка, закладка, карточки, заметки, кубики, бой и два окна прошли проверку.\n',
  );
} finally {
  await browser.close();
}
