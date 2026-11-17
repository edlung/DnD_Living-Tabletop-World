import { describe, expect, it } from 'vitest';

import { browserOf, errorName, frameOf, placeOf } from './report.ts';

/**
 * What a client error report is made of (docs/adr/0073-table-ideas.md §1): the class from a fixed
 * list, the application's own frames cut down to a file name and two numbers, the browser's
 * family from its description of itself.
 */
const ORIGIN = 'https://table.example';

describe('the error’s class', () => {
  it('is its name when the list has it, else Other', () => {
    expect(errorName(new TypeError('x'))).toBe('TypeError');
    expect(errorName(new RangeError('x'))).toBe('RangeError');
    expect(errorName(new DOMException('x', 'NotAllowedError'))).toBe('NotAllowedError');
    class SecretOfTheAshenCircle extends Error {
      override name = 'SecretOfTheAshenCircle';
    }
    expect(errorName(new SecretOfTheAshenCircle('x'))).toBe('Other');
    expect(errorName({ name: 'The DM is a fool' })).toBe('Other');
    expect(errorName('a thrown string')).toBe('Other');
    expect(errorName(null)).toBe('Other');
    expect(errorName(undefined)).toBe('Other');
  });
});

describe('a frame', () => {
  it('is read as each engine writes it', () => {
    const frame = { file: 'index-B7xQ2a.js', line: 12, column: 3456 };
    expect(
      frameOf('    at render (https://table.example/assets/index-B7xQ2a.js:12:3456)', ORIGIN),
    ).toEqual(frame);
    expect(frameOf('    at https://table.example/assets/index-B7xQ2a.js:12:3456', ORIGIN)).toEqual(
      frame,
    );
    expect(frameOf('render@https://table.example/assets/index-B7xQ2a.js:12:3456', ORIGIN)).toEqual(
      frame,
    );
    expect(frameOf('@https://table.example/assets/index-B7xQ2a.js:12:3456', ORIGIN)).toEqual(frame);
  });

  it('keeps the file’s name only: no folder, no address, no query, no function', () => {
    expect(
      frameOf(
        '    at whisperTheSecret (http://127.0.0.1:4310/src/chat/chat-sheet.tsx?t=1731776400000:45:10)',
        'http://127.0.0.1:4310',
      ),
    ).toEqual({ file: 'chat-sheet.tsx', line: 45, column: 10 });
  });

  it('is dropped when it is not a script of the application', () => {
    for (const line of [
      '    at inject (chrome-extension://abcdefghijklmnop/content.js:1:2)',
      '    at other (https://elsewhere.example/assets/index.js:1:2)',
      '    at React (https://table.example/node_modules/.vite/deps/react-dom.js?v=1:10:20)',
      '    at hmr (https://table.example/@vite/client:10:20)',
      '    at page (https://table.example/campaigns/ravenford:1:2)',
      '    at odd (https://table.example/assets/a%20rude%20word.js:1:2)',
      'TypeError: Cannot read properties of undefined (reading "the-secret")',
      '    at <anonymous>',
      '',
    ]) {
      expect(frameOf(line, ORIGIN), line).toBeNull();
    }
  });
});

describe('the place', () => {
  it('is the first three frames of the application’s own scripts', () => {
    const stack = [
      'TypeError: Cannot read properties of undefined (reading "Mira Vale’s secret")',
      '    at inject (chrome-extension://abcdefghijklmnop/content.js:1:2)',
      '    at a (https://table.example/assets/index-a.js:1:10)',
      '    at b (https://table.example/assets/chunk-b.js:2:20)',
      '    at c (https://table.example/assets/chunk-c.js:3:30)',
      '    at d (https://table.example/assets/chunk-d.js:4:40)',
    ].join('\n');
    const place = placeOf(stack, ORIGIN);
    expect(place).toEqual([
      { file: 'index-a.js', line: 1, column: 10 },
      { file: 'chunk-b.js', line: 2, column: 20 },
      { file: 'chunk-c.js', line: 3, column: 30 },
    ]);
    // Nothing of the message travels.
    expect(JSON.stringify(place)).not.toContain('Mira');
  });

  it('is empty for no stack, or a stack of somebody else’s scripts', () => {
    expect(placeOf(undefined, ORIGIN)).toEqual([]);
    expect(placeOf(42, ORIGIN)).toEqual([]);
    expect(placeOf('Error: x\n    at y (chrome-extension://abc/z.js:1:1)', ORIGIN)).toEqual([]);
  });
});

describe('the browser', () => {
  const cases: readonly (readonly [string, number, string, number, string])[] = [
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      5,
      'safari',
      18,
      'ios',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      5,
      'safari',
      18,
      'ios',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
      0,
      'safari',
      17,
      'macos',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      5,
      'safari',
      17,
      'ios',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
      5,
      'chrome',
      131,
      'android',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
      5,
      'samsung',
      26,
      'android',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
      0,
      'edge',
      131,
      'windows',
    ],
    [
      'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
      0,
      'firefox',
      133,
      'linux',
    ],
    [
      'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      0,
      'chrome',
      130,
      'chromeos',
    ],
    ['A browser of my own making', 0, 'other', 0, 'other'],
    ['', 0, 'other', 0, 'other'],
  ];
  it.each(cases)('%s', (userAgent, touch, browser, browserVersion, system) => {
    expect(browserOf(userAgent, touch)).toEqual({ browser, browserVersion, system });
  });

  it('never takes a number it could not be', () => {
    expect(browserOf('Chrome/99999999999', 0).browserVersion).toBe(0);
  });
});
