import { describe, expect, it } from 'vitest';

import cases from '../../../native-shim/cases.json' with { type: 'json' };
import { parseShellMessage, readShell, type NativeShell, type PageMessage } from './shell.ts';
import { holdAwake, nativeHaptic, tellWaiting } from './signals.ts';
import { onForgetAsked, reportToHost } from './tv-report.ts';

/**
 * The page's side of the native apps' bridge (docs/adr/0070-native-apps.md §2, §5, §6): the shell
 * the shim installs is read strictly, the shell's messages are parsed by the shared case table the
 * Swift and Kotlin tests read too, and the alerts reach a shell only where it has the feature.
 */
const fakeShell = (
  features: readonly string[],
  app: 'player' | 'dm' | 'tv' = 'player',
): { readonly shell: NativeShell; readonly sent: PageMessage[] } => {
  const sent: PageMessage[] = [];
  const shell = readShell({
    version: 1,
    platform: 'ios',
    app,
    features,
    post: (message: PageMessage) => sent.push(message),
  });
  if (shell === null) throw new Error('the fake shell was refused');
  return { shell, sent };
};

describe('the shell the shim installs', () => {
  const post = () => undefined;
  it('is read with its platform, app and known features', () => {
    const shell = readShell({
      version: 1,
      platform: 'android',
      app: 'dm',
      features: ['scan', 'tv', 'telepathy', 7],
      post,
    });
    expect(shell?.platform).toBe('android');
    expect(shell?.app).toBe('dm');
    expect(shell?.has('scan')).toBe(true);
    expect(shell?.has('tv')).toBe(true);
    expect(shell?.has('haptics')).toBe(false);
  });

  it.each([
    ['nothing', undefined],
    ['a string', 'ltwNative'],
    ['another version', { version: 2, platform: 'ios', app: 'player', features: [], post }],
    ['an unknown platform', { version: 1, platform: 'web', app: 'player', features: [], post }],
    ['an unknown app', { version: 1, platform: 'ios', app: 'admin', features: [], post }],
    ['no features', { version: 1, platform: 'ios', app: 'player', post }],
    ['no way to post', { version: 1, platform: 'ios', app: 'player', features: [] }],
  ])('is refused when it is %s', (_name, raw) => {
    expect(readShell(raw)).toBeNull();
  });

  it('survives a shell that throws while posting', () => {
    const shell = readShell({
      version: 1,
      platform: 'ios',
      app: 'player',
      features: ['haptics'],
      post: () => {
        throw new Error('gone');
      },
    });
    expect(() => shell?.post({ type: 'ready' })).not.toThrow();
  });
});

describe("the shell's messages (shared cases)", () => {
  it.each(cases.shellMessages.map((entry) => [JSON.stringify(entry.message), entry] as const))(
    '%s',
    (_name, entry) => {
      const parsed = parseShellMessage(entry.message);
      if (entry.valid) expect(parsed).toEqual(entry.message);
      else expect(parsed).toBeNull();
    },
  );
});

describe('the alerts through the shell', () => {
  it('keeps the screen on while anything holds it, and lets go once', () => {
    const { shell, sent } = fakeShell(['awake']);
    const first = holdAwake(shell);
    const second = holdAwake(shell);
    first();
    first();
    expect(sent).toEqual([{ type: 'awake', on: true }]);
    second();
    expect(sent).toEqual([
      { type: 'awake', on: true },
      { type: 'awake', on: false },
    ]);
  });

  it('counts what waits within 0–99', () => {
    const { shell, sent } = fakeShell(['waiting']);
    tellWaiting(3, shell);
    tellWaiting(250, shell);
    tellWaiting(-2, shell);
    tellWaiting(Number.NaN, shell);
    expect(sent.map((message) => (message.type === 'waiting' ? message.count : null))).toEqual([
      3, 99, 0, 0,
    ]);
  });

  it('vibrates through the shell only where it has haptics', () => {
    const { shell, sent } = fakeShell(['haptics']);
    expect(nativeHaptic('alert', shell)).toBe(true);
    expect(sent).toEqual([{ type: 'haptic', kind: 'alert' }]);
    const { shell: without, sent: none } = fakeShell(['awake']);
    expect(nativeHaptic('dice', without)).toBe(false);
    expect(nativeHaptic('dice', null)).toBe(false);
    expect(none).toEqual([]);
  });

  it('sends nothing in a browser', () => {
    expect(holdAwake(null)).toBeTypeOf('function');
    expect(() => {
      tellWaiting(2, null);
    }).not.toThrow();
  });
});

describe('the table display hosted on LTW DM’s TV', () => {
  it('reports its code, its pairing and neither, in the TV window only', () => {
    const { shell, sent } = fakeShell([], 'tv');
    reportToHost({ kind: 'pairing', code: 'AB2CD3EF' }, shell);
    reportToHost({ kind: 'paired', campaign: 'ravenford-ru-1' }, shell);
    reportToHost(null, shell);
    reportToHost({ kind: 'pairing', code: 'not-a-code' }, shell);
    reportToHost({ kind: 'paired', campaign: '<b>' }, shell);
    expect(sent).toEqual([
      { type: 'tv-code', code: 'AB2CD3EF' },
      { type: 'tv-paired', campaign: 'ravenford-ru-1' },
      { type: 'tv-unpaired' },
      { type: 'tv-unpaired' },
      { type: 'tv-unpaired' },
    ]);
    const { shell: dm, sent: quiet } = fakeShell(['tv'], 'dm');
    reportToHost({ kind: 'pairing', code: 'AB2CD3EF' }, dm);
    expect(quiet).toEqual([]);
  });

  it('forgets its pairing when the app asks, in the TV window only', () => {
    const asked: string[] = [];
    const target = new EventTarget();
    Object.assign(globalThis, { window: target });
    try {
      const stop = onForgetAsked(() => asked.push('tv'), fakeShell([], 'tv').shell);
      const quiet = onForgetAsked(() => asked.push('dm'), fakeShell(['tv'], 'dm').shell);
      target.dispatchEvent(new CustomEvent('ltw-native', { detail: { type: 'forget' } }));
      target.dispatchEvent(new CustomEvent('ltw-native', { detail: { type: 'back' } }));
      stop();
      quiet();
      target.dispatchEvent(new CustomEvent('ltw-native', { detail: { type: 'forget' } }));
      expect(asked).toEqual(['tv']);
    } finally {
      Reflect.deleteProperty(globalThis, 'window');
    }
  });
});
