/* global window,document,MutationObserver,HTMLCanvasElement */
import assert from 'node:assert/strict';
import { chromium, webkit, expect } from '@playwright/test';

const url = process.argv[2] || new URL('index.html', import.meta.url).href;
const engine = process.argv[3] === 'webkit' ? webkit : chromium;
const software = process.argv.includes('--software');
const browser = await engine.launch();
const expectMotion = (locator) =>
  expect.poll(() => locator.evaluate((el) => window.motionTargets.has(el))).toBe(true);
// Independently sampled centres (px) of the widest lower silhouette in the approved 500px rasters.
const plinths = {
  asya: [139, 477, 255],
  finn: [142.5, 476, 281],
  ilyr: [131.5, 472, 259],
  kanto: [132.5, 476, 236],
  mika: [133.5, 475, 239],
  omb: [199.5, 475, 241],
  pom: [143.5, 473, 284],
  repairer: [222, 472, 371],
  runa: [139.5, 472, 274],
  saffra: [135.5, 472, 270],
  severin: [140, 473, 259],
  spool: [187, 466, 318],
  tess: [145.5, 476, 256],
  vey: [155.5, 478, 236],
};
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  context.on('page', (p) => p.on('pageerror', (e) => errors.push(e.message)));
  await context.addInitScript(() => {
    // A short animation may already have ended when the browser driver next polls.
    window.motionTargets = new WeakSet();
    new MutationObserver(() => {
      for (const animation of document.getAnimations()) {
        const target = animation.effect?.target;
        if (target) window.motionTargets.add(target);
      }
    }).observe(document, { childList: true, subtree: true });
  });
  if (software)
    await context.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        if (type === 'webgl2') return null;
        return original.call(this, type, ...args);
      };
    });
  const page = await context.newPage();
  await page.goto(url + '#dice');
  const surface = page.locator('.dice-stage');
  await expect(surface).toHaveAttribute('data-state', 'ready');
  const backend = await surface.getAttribute('data-renderer');
  assert.ok(software ? backend === 'canvas3d' : ['webgl', 'canvas3d'].includes(backend));
  const area = await surface.boundingBox();
  const sample = page.evaluate(
    () =>
      new Promise((resolve) => {
        const desk = document.querySelector('.dice-stage'),
          shadow = desk.querySelector('.ground-shadow');
        const points = [];
        const observer = new MutationObserver(() => {
          if (desk.dataset.state === 'rolling' || desk.dataset.state === 'settled')
            points.push([parseFloat(shadow.style.left), parseFloat(shadow.style.opacity)]);
          if (desk.dataset.state === 'settled' && points.length) {
            observer.disconnect();
            resolve(points);
          }
        });
        observer.observe(desk, {
          attributes: true,
          subtree: true,
          attributeFilter: ['style', 'data-state'],
        });
      }),
  );
  await page.mouse.move(area.x + area.width * 0.16, area.y + area.height * 0.64);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width * 0.84, area.y + area.height * 0.33, { steps: 9 });
  await page.mouse.up();
  await expect(surface).toHaveAttribute('data-state', 'settled', { timeout: 12000 });
  const points = await sample;
  const spread = (values) => Math.max(...values) - Math.min(...values);
  const travelled = spread(points.map((p) => p[0]));
  assert.ok(
    points.length >= 5 && travelled > 26,
    'die travel: ' + travelled.toFixed(1) + '% in ' + points.length + ' frames',
  );
  assert.ok(spread(points.map((p) => p[1])) > 0.13, 'airborne and contact shadows must differ');
  await expect(page.locator('.dice-result')).toHaveText(
    'Выпало ' + (await surface.getAttribute('data-face')) + ' на d20',
  );
  await page.getByRole('button', { name: 'Бросить d20' }).click();
  await expect(surface).toHaveAttribute('data-state', 'rolling');
  await page.getByRole('button', { name: 'd6', exact: true }).click();
  await expect(surface).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('.dice-result')).toHaveText('Кубик готов к броску');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Бросить d6' }).click();
  await expect(surface).toHaveAttribute('data-state', 'settled');
  const faces = await page.evaluate(async () => {
    const observed = [];
    // Every face, including the highest number, is checked from the final mesh orientation.
    for (const sides of [6, 20]) {
      const fixture = document.createElement('div');
      fixture.style.cssText =
        'position:fixed;left:0;top:0;width:580px;height:310px;visibility:hidden';
      fixture.innerHTML = '<span class="ground-shadow"></span><canvas></canvas>';
      document.body.append(fixture);
      const die = await window.LighthouseDice3D.createStage(fixture, sides, sides);
      try {
        for (let target = 1; target <= sides; target++)
          die.roll(target, null, true, (result) => observed.push({ target, result }));
      } finally {
        die.dispose();
        fixture.remove();
      }
    }
    return observed;
  });
  assert.equal(faces.length, 26);
  assert.ok(faces.every((f) => f.target === f.result));
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#book\/6\/3$/);
  const geometry = await page.evaluate(async (specs) => {
    let sample,
      worst = 0,
      cases = 0;
    const entries = Object.entries(specs);
    for (const cell of [52, 144, 216]) {
      for (const interactive of [true, false]) {
        for (let start = 0; start < entries.length; start += 7) {
          const actors = entries.slice(start, start + 7).map(([id], i) => ({
            id,
            x: i,
            y: 3,
            name: id,
            short: id,
            side: 'party',
            portrait: 'asya',
            figure: 'heroes-' + id,
          }));
          const frame = {
            map: 'forge',
            place: 'Кузница',
            round: 1,
            active: actors[0].id,
            mode: 'figures',
            grid: true,
            pieces: actors,
          };
          const fixture = document.createElement('div');
          fixture.style.cssText =
            'position:fixed;left:0;top:0;visibility:hidden;width:' +
            10 * cell +
            'px;height:' +
            8 * cell +
            'px';
          fixture.innerHTML = window.LighthouseBoard.board(frame, interactive);
          document.body.append(fixture);
          for (const el of fixture.querySelectorAll('.piece')) {
            const image = el.querySelector('img');
            await image.decode();
            const b = image.getBoundingClientRect(),
              ring = el.querySelector('.piece-base').getBoundingClientRect(),
              [ax, ay, w] = specs[el.dataset.figure];
            const x = b.left + (ax / image.naturalWidth) * b.width,
              y = b.top + (ay / image.naturalHeight) * b.height;
            const error =
              (100 * Math.hypot(ring.x + ring.width / 2 - x, ring.y + ring.height / 2 - y)) / cell;
            if (error > worst) {
              worst = error;
              sample = {
                id: el.dataset.figure,
                cell,
                x,
                y,
                ringX: ring.x + ring.width / 2,
                ringY: ring.y + ring.height / 2,
              };
            }
            const clearance = (ring.width - (w / image.naturalWidth) * b.width) / cell;
            if (clearance < 0.045 || clearance > 0.076)
              throw Error('Pedestal border width: ' + el.dataset.figure);
            cases++;
          }
          fixture.remove();
        }
      }
    }
    return { cases, worst, sample };
  }, plinths);
  assert.equal(geometry.cases, 84);
  assert.ok(geometry.worst < 0.7, 'pedestal centre offset: ' + JSON.stringify(geometry));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect
    .poll(() => page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches))
    .toBe(false);
  await page.keyboard.press('ArrowLeft');
  await expect(page).toHaveURL(/#book\/6\/2$/);
  await expectMotion(page.locator('.guide-leaf'));
  await page.goto(url + '#battle/workshop-repairer');
  await page.getByRole('button', { name: 'Следующий ход' }).click();
  await expectMotion(page.locator('.piece.acting .piece-base'));
  await page.getByRole('button', { name: 'Переставить фигурку' }).click();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expectMotion(page.locator('.piece.acting'));
  await page.getByRole('button', { name: 'Жетоны' }).click();
  await expectMotion(page.locator('.piece.acting .piece-body'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Следующий ход' }).click();
  assert.equal(
    await page
      .locator('.piece.acting')
      .evaluate((el) => el.getAnimations({ subtree: true }).length),
    0,
  );
  assert.deepEqual(errors, []);
  process.stdout.write(
    backend +
      ' · ' +
      faces.length +
      ' upper faces · horizontal travel ' +
      travelled.toFixed(1) +
      '% · ' +
      geometry.cases +
      ' pedestal checks · maximum error ' +
      geometry.worst.toFixed(2) +
      '% of a square.\n',
  );
} finally {
  await browser.close();
}
