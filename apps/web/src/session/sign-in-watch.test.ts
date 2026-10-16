import type { SessionResponse } from '@ltw/contracts';
import { describe, expect, it, vi } from 'vitest';

import { checkSignIn, SignInWatch, watchReturns } from './sign-in-watch.ts';

/**
 * A tab's sign-in, checked again (docs/STAGE_340_DESIGN.md "Part B review fixes"): the session
 * cookie is the browser's, so another tab may have signed out or replaced the sign-in. On a doubt
 * the tab asks `GET /auth/session` and the campaign's `session` view; signed out, another campaign,
 * actor, role or character is a change, which signs the tab out.
 */
const json = (body: unknown, status = 200) => Response.json(body, { status });

const DM: SessionResponse = {
  actorId: 'dm-ravenford',
  role: 'DM',
  character: null,
  campaign: { campaignId: 'ravenford', name: 'The Missing Caravan', language: 'en' },
  perspectives: [{ value: 'DM', label: 'Dungeon Master' }],
};
const ELOWEN: SessionResponse = {
  ...DM,
  actorId: 'player:7f1c',
  role: 'PLAYER',
  character: { entityId: 'elowen-starwhisper', kind: 'character', name: 'Elowen' },
  perspectives: [{ value: 'PLAYER', label: 'Elowen' }],
};
const SHOWN_DM = {
  campaignId: 'ravenford',
  actorId: 'dm-ravenford',
  role: 'DM',
  characterId: null,
} as const;

/** Answers in order; every request is recorded by its URL. */
function server(...answers: (Response | Error)[]) {
  const urls: string[] = [];
  const pending: (() => void)[] = [];
  let held = false;
  const transport = vi.fn((input: unknown) => {
    urls.push(String(input));
    const answer = answers.shift() ?? new Error('no answer');
    const reply = () =>
      answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    if (!held) return reply();
    return new Promise<Response>((resolve, reject) => {
      pending.push(() => {
        reply().then(resolve, reject);
      });
    });
  });
  return {
    transport,
    urls,
    /** Answers wait until `release`. */
    hold: () => {
      held = true;
    },
    release: () => {
      held = false;
      for (const answer of pending.splice(0)) answer();
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('checking the sign-in again', () => {
  it('finds the same sign-in when the campaign, actor, role and character match', async () => {
    const { transport, urls } = server(json({ campaignId: 'ravenford' }), json(DM));
    await expect(checkSignIn(transport, 'ravenford', SHOWN_DM)).resolves.toBe('same');
    expect(urls).toEqual(['/api/auth/session', '/api/campaigns/ravenford/session']);
  });

  it('calls signed out, another campaign or another person a change', async () => {
    const answers: (Response | Error)[][] = [
      [json({}, 401)],
      [json({ campaignId: 'ravenford' }), json({}, 401)],
      [json({ campaignId: 'ravenford' }), json({}, 404)],
      [
        json({ campaignId: 'harbor' }),
        json({ ...DM, campaign: { ...DM.campaign, campaignId: 'harbor' } }),
      ],
      [json({ campaignId: 'ravenford' }), json(ELOWEN)],
      [json({ campaignId: 'ravenford' }), json({ ...DM, actorId: 'dm-other' })],
    ];
    for (const answer of answers) {
      await expect(checkSignIn(server(...answer).transport, 'ravenford', SHOWN_DM)).resolves.toBe(
        'changed',
      );
    }
  });

  it('compares the campaign alone before the tab has read its identity', async () => {
    const same = server(json({ campaignId: 'ravenford' }));
    await expect(checkSignIn(same.transport, 'ravenford', null)).resolves.toBe('same');
    const other = server(json({ campaignId: 'harbor' }));
    await expect(checkSignIn(other.transport, 'ravenford', null)).resolves.toBe('changed');
    expect([...same.urls, ...other.urls]).toEqual(['/api/auth/session', '/api/auth/session']);
  });

  it('knows nothing from no answer or a server error: that is no change', async () => {
    for (const answer of [
      [new Error('offline')],
      [json({}, 500)],
      [json({}, 404)],
      [json({ campaignId: 'ravenford' }), new Error('offline')],
      [json({ campaignId: 'ravenford' }), json({}, 503)],
    ]) {
      await expect(checkSignIn(server(...answer).transport, 'ravenford', SHOWN_DM)).resolves.toBe(
        'unknown',
      );
    }
  });
});

describe('the watch over a session screen', () => {
  const watching = (transport: typeof fetch) => {
    const onChanged = vi.fn();
    const watch = new SignInWatch({ transport, campaignId: 'ravenford', onChanged });
    return { watch, onChanged };
  };

  it('holds the first identity it is shown, and calls another one a change at once', () => {
    const { transport } = server();
    const { watch, onChanged } = watching(transport);
    watch.observe(DM);
    watch.observe({ ...DM, perspectives: [] });
    expect(onChanged).not.toHaveBeenCalled();
    watch.observe(ELOWEN);
    expect(onChanged).toHaveBeenCalledTimes(1);
    watch.observe(DM);
    watch.observe(ELOWEN);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(transport).not.toHaveBeenCalled();
  });

  it('calls a first identity of another campaign a change', () => {
    const { watch, onChanged } = watching(server().transport);
    watch.observe({ ...DM, campaign: { ...DM.campaign, campaignId: 'harbor' } });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('asks the server on a doubt, and signs the tab out when another sign-in answers', async () => {
    const { transport, urls } = server(json({ campaignId: 'ravenford' }), json(ELOWEN));
    const { watch, onChanged } = watching(transport);
    watch.observe(DM);
    watch.doubt();
    await vi.waitFor(() => {
      expect(onChanged).toHaveBeenCalledTimes(1);
    });
    expect(urls).toEqual(['/api/auth/session', '/api/campaigns/ravenford/session']);
    // Reported once; a closed watch asks nothing more.
    watch.doubt();
    watch.observe(ELOWEN);
    await flush();
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(urls).toHaveLength(2);
  });

  it('keeps the tab when the same sign-in answers, or nothing does', async () => {
    const { transport } = server(json({ campaignId: 'ravenford' }), json(DM), new Error('offline'));
    const { watch, onChanged } = watching(transport);
    watch.observe(DM);
    watch.doubt();
    await vi.waitFor(() => {
      expect(transport).toHaveBeenCalledTimes(2);
    });
    await flush();
    watch.doubt();
    await vi.waitFor(() => {
      expect(transport).toHaveBeenCalledTimes(3);
    });
    await flush();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('asks one question at a time, and once more for doubts that came meanwhile', async () => {
    const answers = server(
      json({ campaignId: 'ravenford' }),
      json(DM),
      json({ campaignId: 'ravenford' }),
      json(ELOWEN),
    );
    const { watch, onChanged } = watching(answers.transport);
    watch.observe(DM);
    answers.hold();
    watch.doubt();
    watch.doubt();
    watch.doubt();
    await flush();
    expect(answers.urls).toEqual(['/api/auth/session']);
    answers.release();
    // The question that was out found the DM; the doubts meanwhile ask once more, and find Elowen.
    await vi.waitFor(() => {
      expect(onChanged).toHaveBeenCalledTimes(1);
    });
    expect(answers.urls).toHaveLength(4);
  });

  it('reports nothing once closed, even for a question already on its way', async () => {
    const answers = server(json({}, 401));
    const { watch, onChanged } = watching(answers.transport);
    answers.hold();
    watch.doubt();
    watch.close();
    answers.release();
    await flush();
    await flush();
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe('returning to a tab', () => {
  const page = (visibilityState: DocumentVisibilityState) => {
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState });
    return { win, doc };
  };

  it('doubts the sign-in when the browser is back online or the tab is shown again', () => {
    const { win, doc } = page('visible');
    const onReturn = vi.fn();
    const stop = watchReturns(win, doc, onReturn);
    win.dispatchEvent(new Event('online'));
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(onReturn).toHaveBeenCalledTimes(2);
    stop();
    win.dispatchEvent(new Event('online'));
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(onReturn).toHaveBeenCalledTimes(2);
  });

  it('does not ask while the tab is hidden', () => {
    const { win, doc } = page('hidden');
    const onReturn = vi.fn();
    watchReturns(win, doc, onReturn);
    doc.dispatchEvent(new Event('visibilitychange'));
    win.dispatchEvent(new Event('offline'));
    expect(onReturn).not.toHaveBeenCalled();
  });
});
