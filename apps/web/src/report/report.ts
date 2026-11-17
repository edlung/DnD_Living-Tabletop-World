import {
  CLIENT_ERROR_FRAMES,
  CLIENT_ERROR_NAMES,
  clientErrorFrameSchema,
  type ClientBrowser,
  type ClientErrorFrame,
  type ClientErrorName,
  type ClientSystem,
} from '@ltw/contracts';

/**
 * What a client error report is made of (docs/adr/0073-table-ideas.md §1), worked out from an
 * error's class and stack and the browser's description of itself. Nothing here reads a message:
 * a message can quote what it failed on. Pure, so every rule is a unit test.
 */

/** The error's class if it is one a report may name, else `Other`. */
export function errorName(thrown: unknown): ClientErrorName {
  const name =
    typeof thrown === 'object' && thrown !== null && 'name' in thrown ? thrown.name : undefined;
  return CLIENT_ERROR_NAMES.find((known) => known === name) ?? 'Other';
}

/** An address with a line and a column, as every engine ends a frame. */
const LOCATION = /(https?:\/\/[^\s/()@]+)(\/[^\s()?#]*)?(?:\?[^\s()]*?)?:(\d+):(\d+)\)?\s*$/;

/**
 * One line of a stack as a frame of the application's own script, or null: a script of another
 * origin (an extension), a library served on its own in development, or a line that names no
 * script. Only the file's name is kept — no folder, no address, no query, no function.
 */
export function frameOf(line: string, origin: string): ClientErrorFrame | null {
  const match = LOCATION.exec(line);
  if (!match || match[1] !== origin) return null;
  const path = match[2] ?? '';
  if (path.includes('/node_modules/') || path.startsWith('/@')) return null;
  const frame = clientErrorFrameSchema.safeParse({
    file: path.slice(path.lastIndexOf('/') + 1),
    line: Number(match[3]),
    column: Number(match[4]),
  });
  return frame.success ? frame.data : null;
}

/** The first frames of the application's own scripts in a stack; none when it names none. */
export function placeOf(stack: unknown, origin: string): ClientErrorFrame[] {
  if (typeof stack !== 'string') return [];
  return stack
    .split('\n')
    .slice(0, 60)
    .flatMap((line) => frameOf(line, origin) ?? [])
    .slice(0, CLIENT_ERROR_FRAMES);
}

const version = (match: RegExpExecArray | null): number => {
  const major = Number(match?.[1] ?? 0);
  return Number.isInteger(major) && major >= 0 && major <= 9999 ? major : 0;
};

/**
 * The browser's family, its major version and the device's system, from the browser's own
 * description of itself (which is not sent). An iPad says it is a Mac: touch tells them apart.
 */
export function browserOf(
  userAgent: string,
  touchPoints: number,
): { browser: ClientBrowser; browserVersion: number; system: ClientSystem } {
  const system: ClientSystem = /iPhone|iPad|iPod/.test(userAgent)
    ? 'ios'
    : /Android/.test(userAgent)
      ? 'android'
      : /CrOS/.test(userAgent)
        ? 'chromeos'
        : /Windows/.test(userAgent)
          ? 'windows'
          : /Macintosh/.test(userAgent)
            ? touchPoints > 1
              ? 'ios'
              : 'macos'
            : /Linux/.test(userAgent)
              ? 'linux'
              : 'other';
  const families: readonly (readonly [ClientBrowser, RegExp])[] = [
    ['edge', /Edg(?:e|A|iOS)?\/(\d+)/],
    ['samsung', /SamsungBrowser\/(\d+)/],
    ['opera', /OPR\/(\d+)/],
    ['firefox', /(?:Firefox|FxiOS)\/(\d+)/],
    ['chrome', /(?:Chrome|CriOS)\/(\d+)/],
    ['safari', /Version\/(\d+)[^ ]* (?:Mobile\/\S+ )?Safari/],
    // A web view on an iPhone or an iPad (the native apps) names no browser: Safari's engine.
    ['safari', /OS (\d+)_\d+[^)]*\) AppleWebKit/],
  ];
  for (const [browser, pattern] of families) {
    const match = pattern.exec(userAgent);
    if (match) return { browser, browserVersion: version(match), system };
  }
  return { browser: 'other', browserVersion: 0, system };
}
