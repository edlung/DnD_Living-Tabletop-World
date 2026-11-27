/* global window, Element */
import assert from 'node:assert/strict';
import { chromium, webkit, expect } from '@playwright/test';

const url = process.argv[2] || new URL('index.html', import.meta.url).href;
const browser = await (process.argv[3] === 'webkit' ? webkit : chromium).launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  context.on('page', (p) => p.on('pageerror', (e) => errors.push(e.message)));
  await context.addInitScript(() => {
    if (window.published) return;
    window.published = [];
    window.strikeEffects = [];
    window.tones = [];
    const send = MessagePort.prototype.postMessage;
    MessagePort.prototype.postMessage = function (packet, ...args) {
      if (['board', 'story', 'roll'].includes(packet?.kind))
        window.published.push(JSON.parse(JSON.stringify(packet)));
      return send.call(this, packet, ...args);
    };
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, timing) {
      if (this.matches('.forge-contact,.forge-echo'))
        window.strikeEffects.push({ name: this.className, delay: timing.delay });
      return animate.call(this, frames, timing);
    };
    const prototype = (window.AudioContext || window.webkitAudioContext)?.prototype;
    if (prototype) {
      const create = prototype.createOscillator;
      prototype.createOscillator = function () {
        const oscillator = create.call(this),
          start = oscillator.start;
        oscillator.start = function (when) {
          window.tones.push(when - this.context.currentTime);
          return start.call(this, when);
        };
        return oscillator;
      };
    }
  });
  const page = await context.newPage();
  const btn = (name) => page.getByRole('button', { name, exact: true });
  await page.goto(url + '#book/6/1');
  await expect(page.locator('h1')).toHaveText('Что именно сломалось');
  await expect(btn('Открыть поле боя')).toHaveCount(0);
  const coverage = await page.evaluate(() => {
    const E = window.Lighthouse;
    const cues = E.chapters.flatMap((c, chapter) =>
      c.scenes.map((s, scene) => ({ cue: E.cue({ chapter, scene }), s })),
    );
    return {
      openings: new Set(cues.map((c) => c.cue.line)).size,
      cards: new Set(cues.flatMap((c) => c.cue.cards)).size,
      fights: cues.filter((c) => c.cue.fight).length,
      material: cues.every(
        (c) =>
          c.cue.line &&
          c.cue.prompt &&
          c.cue.cards.every((k) => E.handouts[k]) &&
          c.s.rolls.every((o) =>
            ['finn', 'tess', 'asya'].every((id) => Number.isInteger(E.people[id].modifiers[o.key])),
          ),
      ),
    };
  });
  assert.deepEqual(coverage, { openings: 36, cards: 17, fights: 3, material: true });
  const waiting = page.waitForEvent('popup');
  await btn('Показать место на телевизоре').click();
  const tv = await waiting;
  await tv.setViewportSize({ width: 1920, height: 1080 });
  await expect(tv.locator('.show-place h1')).toHaveText('Облачная Кузница');
  await expect(tv.locator('.hammer-art')).toBeVisible();
  await expect.poll(() => tv.evaluate(() => window.strikeEffects.length)).toBeGreaterThanOrEqual(2);
  assert.deepEqual(
    await tv.evaluate(() =>
      ['forge-contact', 'forge-echo'].map(
        (name) => window.strikeEffects.find((e) => e.name === name)?.delay,
      ),
    ),
    [900, 1900],
  );
  const autoSound = await tv
    .waitForFunction(() => window.tones.length > 0, null, { timeout: 1200 })
    .then(
      () => true,
      () => false,
    );
  if (!autoSound) await tv.getByRole('button', { name: 'Включить звук', exact: true }).click();
  await expect.poll(() => tv.evaluate(() => window.tones.length)).toBeGreaterThan(0);
  assert.ok(await tv.evaluate(() => window.tones.some((x) => x > 1.65 && x < 2.05)));
  await btn('Раздатка').click();
  await btn('Развернуть текст').click();
  await expect(page.locator('.preview-window')).toHaveClass(/unfolded/);
  await btn('Свернуть текст').click();
  await expect(page.locator('.preview-window')).toContainText('Четыре независимых сигнала');
  await expect(tv.locator('.show-place h1')).toBeVisible();
  await btn('Выдать раздатку игрокам').click();
  await expect(tv.locator('.card-paper h1')).toHaveText('Четыре независимых сигнала');
  const text = await page.locator('.preview-window .card-paper p').first().innerText();
  await expect(tv.locator('.card-paper p').first()).toHaveText(text);
  await btn('Запросить проверку').click();
  await page.locator('#check-hero').selectOption('asya');
  await page.locator('#check-skill').selectOption('investigation');
  await btn('Попросить бросок на телевизоре').click();
  await expect(tv.locator('.show-check')).toContainText('Ася Вереск');
  await expect(tv.locator('.show-check')).toContainText('Анализ');
  await page.getByLabel('Если бросили свой кубик').fill('3');
  await btn('Записать бросок').click();
  await expect(page.locator('.check-result')).toContainText('Осложнение');
  await expect(tv.locator('.public-total')).toHaveCount(0);
  await btn('Показать итог игрокам').click();
  await expect(tv.locator('.public-total')).toContainText('Осложнение');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await btn('Бросить d20 за столом').click();
  await btn('Бросить d20').click();
  await expect(page.locator('.dice-stage')).toHaveAttribute('data-state', 'settled');
  const checkFace = await page.locator('.dice-stage').getAttribute('data-face');
  await btn('К проверке').click();
  await expect(page.locator('.check-result')).toContainText('d20 (' + checkFace + ')');
  await page.keyboard.press('Escape');
  await expect(btn('Запросить проверку')).toBeFocused();
  await page.getByRole('link', { name: 'Дальше' }).click();
  await expect(page.locator('h1')).toHaveText('Сборка мостика');
  await expect(page.locator('.dm-cue')).toContainText('страховочная сеть');
  await expect(tv.locator('.show-check')).toBeVisible();
  await btn('Дать имя мосту').click();
  const bridge = 'Мост «Три фонаря» & рассвет';
  await page.locator('[name=name]').fill(bridge);
  await btn('Подписать на карте').click();
  await expect(page.locator('.atlas-pin')).toContainText(bridge);
  await expect(page.locator('.archive')).toContainText('Четыре независимых сигнала');
  await btn('Подписать место').click();
  await page.locator('[name=hero]').selectOption('tess');
  await page.locator('[name=name]').fill('Обход Тэс');
  await btn('Подписать на карте').click();
  await btn('Показать карту на телевизоре').click();
  await expect(tv.locator('.atlas-pin')).toContainText(bridge);
  await expect(tv.locator('.atlas-pin')).toContainText('Обход Тэс');
  await page.keyboard.press('Escape');
  await btn('Итоги встречи').click();
  const recap = [
    'Разобрались с задержкой звона.',
    'Ильеру обещали проверить мост.',
    'Куда ведёт обход?',
  ];
  for (const [i, key] of ['discovery', 'promise', 'question'].entries())
    await page.locator('[name=' + key + ']').fill(recap[i]);
  await btn('Сохранить итоги').click();
  await expect(page.getByRole('dialog')).toContainText(recap[0]);
  await page.keyboard.press('Escape');
  await btn('Заметки').click();
  const secret = 'Секрет мастера о завтрашней встрече';
  await page.locator('#scene-note').fill(secret);
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Дальше' }).click();
  await btn('Записать мирный исход').click();
  await expect(page.locator('.peace-note')).toContainText('мирный выход');
  await expect(page.locator('h1')).toHaveText('Упрямый автомат и три проекта');
  await btn('Открыть поле боя').click();
  await btn('На телевизор').click();
  await expect(tv.locator('.tv-turn')).toBeVisible();
  for (let i = 0; i < 3; i++) await btn('Следующий ход').click();
  await btn('Переставить фигурку').click();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  const actor = page.locator('.turn-entry[data-piece="repairer"]');
  await actor.click();
  await expect(page.locator('.turn-guidance')).toContainText('старом шаблоне');
  const hidden = 'Приватная метка Ильера';
  await page.getByLabel('Хиты из 22').fill('17');
  await page.getByLabel('Состояние', { exact: true }).fill(hidden);
  await btn('Сохранить состояние').click();
  await btn('Кубики участника').click();
  await btn('Бросить d20').click();
  await expect(page.locator('.dice-stage')).toHaveAttribute('data-state', 'settled');
  await expect(tv.locator('#tv-roll')).toBeHidden();
  await tv.emulateMedia({ reducedMotion: 'reduce' });
  await btn('Бросить на телевизор').click();
  await expect(tv.locator('.tv-throw p')).toContainText('Выпало', { timeout: 12000 });
  await expect(page.locator('.dice-stage')).toHaveAttribute('data-state', 'settled');
  await expect(tv.locator('.tv-throw p')).toHaveText(
    await page.locator('.dice-result').innerText(),
  );
  await btn('К участнику').click();
  await expect(page.getByLabel('Хиты из 22')).toHaveValue('17');
  await page.keyboard.press('Escape');
  await expect(actor).toBeFocused();
  await expect(tv.locator('#tv-roll')).toBeHidden({ timeout: 8000 });
  await expect(tv.locator('.piece.acting')).toHaveAttribute('data-actor', 'repairer');
  assert.equal(
    await tv.locator('.piece.acting').evaluate((el) => el.style.getPropertyValue('--x')),
    '7',
  );
  const published = await page.evaluate(() => window.published);
  assert.equal(published.filter((p) => p.kind === 'roll').length, 1);
  for (const privateText of [...recap, secret, hidden, 'vitals/', 'Ближайшее действие'])
    assert.ok(!JSON.stringify(published).includes(privateText));
  await actor.click();
  await btn('Завершить встречу мирно').click();
  await expect(page.locator('.peace-note')).toContainText('мирный выход');
  await expect(tv.locator('.tv-idle')).toBeVisible();
  await page.getByRole('link', { name: 'На полку' }).click();
  await page.reload();
  for (const line of recap) await expect(page.locator('.memory-slip')).toContainText(line);
  await btn('Карта партии').click();
  await expect(page.locator('.atlas-pin')).toContainText(bridge);
  await page.keyboard.press('Escape');
  await btn('Открыть записи').click();
  await btn('Новая встреча').click();
  await page.getByLabel('Что выяснили').fill('Второй вечер');
  await btn('Сохранить итоги').click();
  await expect(page.locator('.recap-lines').last()).toContainText('Второй вечер');
  await page.locator('#recap-which').selectOption({ index: 1 });
  await expect(page.getByRole('dialog')).toContainText(recap[1]);
  await page.keyboard.press('Escape');
  await page.goto(url + '#battle/workshop-repairer');
  await expect(page.locator('.piece.acting')).toHaveAttribute('data-actor', 'repairer');
  await actor.click();
  await expect(page.getByLabel('Хиты из 22')).toHaveValue('17');
  await expect(page.getByLabel('Состояние', { exact: true })).toHaveValue(hidden);
  assert.deepEqual(errors, []);
  process.stdout.write(
    '36 сцен · 17 раздаток · три встречи · звук через 1 с · карта и память после перезагрузки · закрытый и открытый бросок · два окна.\n',
  );
} finally {
  await browser.close();
}
