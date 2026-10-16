import { expect, type Page, type Response } from '@playwright/test';

import boundary from '../../../fixtures/ravenford/knowledge-boundary.json' with { type: 'json' };
import hiddenCharacter from '../fixtures/hidden-character.json' with { type: 'json' };
import { chooseLocation } from './shell.ts';

export const HIDDEN_CHARACTER = hiddenCharacter;
const playerForbidden = [
  ...boundary.forbiddenMarkers['CHARACTER:elowen-starwhisper'],
  hiddenCharacter.entityId,
  hiddenCharacter.name,
];

export const TOKENS = {
  player: 'dev-player-elowen',
  dm: 'dev-dm-ravenford',
  outsider: 'dev-outsider',
} as const;

export async function enterWorld(
  page: Page,
  token: string = TOKENS.player,
  campaign = 'ravenford',
): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Access token', { exact: true }).fill(token);
  await page.getByLabel('Campaign', { exact: true }).fill(campaign);
  await page.getByRole('button', { name: 'Enter world', exact: true }).click();
}

export async function playerScene(page: Page): Promise<void> {
  await enterWorld(page);
  await chooseLocation(page, 'market-square');
  await expect(page.getByRole('button', { name: 'Mira Vale', exact: true })).toBeVisible();
}

/** Scans the complete DOM, including collapsed disclosure content. */
export async function expectPlayerBoundary(page: Page): Promise<void> {
  const dom = await page.content();
  for (const marker of playerForbidden) {
    expect(dom, `player DOM must not contain ${marker}`).not.toContain(marker);
  }
}

/**
 * The live signal (ADR 0033) is an open event stream whose body never ends while the page
 * lives, and it carries only fixed protocol frames, never world content; the server tests
 * hold every frame to that grammar. Body collectors skip it.
 */
export const isLiveStream = (response: Response): boolean =>
  /^\/api\/campaigns\/[^/]+\/live$/.test(new URL(response.url()).pathname);

/** The browser network is also a boundary, including data not rendered by UI. */
export function collectApiBodies(page: Page): {
  assertPlayerBoundary(
    extraMarkers?: readonly string[],
    perceived?: readonly string[],
    ownViews?: readonly string[],
  ): Promise<void>;
} {
  const received: Promise<{ readonly path: string; readonly body: string }>[] = [];
  const collect = (response: Response) => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith('/api/') && !isLiveStream(response)) {
      // Aborted requests have no delivered response body.
      received.push(
        response.text().then(
          (body) => ({ path, body }),
          () => ({ path, body: '' }),
        ),
      );
    }
  };
  page.on('response', collect);
  return {
    // `perceived` lists markers the acting character legitimately perceives at its
    // current location (ADR 0012), e.g. a child location's ID with a null name.
    // `ownViews` lists the paths of the viewer's own authorized views (its own character
    // sheet): the extra markers, which name statistics no one else's may reveal, do not apply
    // to them; the knowledge boundary's markers apply to every payload.
    async assertPlayerBoundary(extraMarkers = [], perceived = [], ownViews = []) {
      const bodies = await Promise.all(received);
      const payloads = bodies.map((entry) => entry.body).join('\n');
      expect(payloads).not.toBe('');
      const forbidden = playerForbidden.filter((marker) => !perceived.includes(marker));
      for (const marker of forbidden) {
        expect(payloads, `player HTTP payload must not contain ${marker}`).not.toContain(marker);
      }
      const others = bodies
        .filter((entry) => !ownViews.some((own) => entry.path.endsWith(own)))
        .map((entry) => entry.body)
        .join('\n');
      for (const marker of extraMarkers) {
        expect(others, `player HTTP payload must not contain ${marker}`).not.toContain(marker);
      }
    },
  };
}

/** Delay a real response; never replace its canonical contents. */
export async function holdResponse(
  page: Page,
  matches: (url: URL) => boolean,
): Promise<{ requested: Promise<void>; release(): void; completed: Promise<void> }> {
  let release: () => void;
  let requested: () => void;
  let completed: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const arrived = new Promise<void>((resolve) => {
    requested = resolve;
  });
  const finished = new Promise<void>((resolve) => {
    completed = resolve;
  });
  await page.route('**/api/**', async (route) => {
    if (!matches(new URL(route.request().url()))) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    requested();
    await wait;
    await route.fulfill({ response });
    completed();
  });
  return {
    requested: arrived,
    release: () => {
      release();
    },
    completed: finished,
  };
}
