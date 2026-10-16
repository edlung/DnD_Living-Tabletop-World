import {
  ASSET_FAILURES,
  type AssetLineageResponse,
  type AssetRequestView,
  type AssetView,
} from '@ltw/contracts';
import { translate, type Translate } from '@ltw/ui';
import { describe, expect, it } from 'vitest';

import '../i18n/ru-images.ts';
import '../i18n/ru-visual.ts';
import {
  choiceOfKind,
  choicesFor,
  entityImages,
  kindOfChoice,
  pendingWork,
  repeatCommand,
  requestCommand,
  STATES,
} from './lineage.ts';
import { FAILURE_WORDS, JOB_WORDS, kindWords, stateWords } from './words.ts';

const hash = (n: number) => `sha256:${n.toString(16).padStart(64, '0')}`;

let made = 0;
function request(entityId: string, fields: Partial<AssetRequestView> = {}): AssetRequestView {
  made += 1;
  return {
    requestId: `req-${String(made)}#0`,
    entityId,
    variant: 'reference',
    purpose: 'image',
    label: null,
    audience: 'players',
    note: null,
    derivedFrom: null,
    source: { kind: 'dm' },
    status: 'COMPLETED',
    failure: null,
    requestedAt: 0,
    ...fields,
  };
}

function asset(from: AssetRequestView, fields: Partial<AssetView> = {}): AssetView {
  return {
    assetId: `${from.requestId}~asset`,
    requestId: from.requestId,
    entityId: from.entityId,
    variant: from.variant,
    purpose: from.purpose,
    label: from.label,
    audience: from.audience,
    version: 1,
    derivedFrom: from.derivedFrom,
    contentHash: hash(made),
    mediaType: 'image/webp',
    generator: { provider: 'curated', model: 'codex-cli/imagegen' },
    status: 'APPROVED',
    ...fields,
  };
}

/** North Gate's lineage: a replaced main picture, two night pictures, a candidate, work. */
interface NorthGate {
  readonly lineage: AssetLineageResponse;
  readonly ids: {
    readonly second: string;
    readonly night2: string;
    readonly map: string;
    readonly fog: string;
    readonly snow: string;
    readonly stormAgain: string;
    readonly rain: string;
  };
}

function northGate(): NorthGate {
  const first = request('north-gate');
  const second = request('north-gate', { note: 'Banners on the walls' });
  const night1 = request('north-gate', { variant: 'derived', label: 'night' });
  const night2 = request('north-gate', { variant: 'derived', label: 'night' });
  const map = request('north-gate', { variant: 'derived', purpose: 'battle-map', label: 'map' });
  const fog = request('north-gate', { variant: 'derived', label: 'fog', note: 'Thick fog' });
  const snowFailed = request('north-gate', {
    variant: 'derived',
    label: 'snow',
    status: 'FAILED',
    failure: 'UNAVAILABLE',
  });
  const stormFailed = request('north-gate', {
    variant: 'derived',
    label: 'storm',
    status: 'FAILED',
    failure: 'TIMEOUT',
  });
  const stormAgain = request('north-gate', {
    variant: 'derived',
    label: 'storm',
    status: 'QUEUED',
  });
  const rain = request('north-gate', { variant: 'derived', label: 'rain', status: 'STARTED' });
  const discarded = request('north-gate', { variant: 'derived', label: 'dusk' });
  const other = request('mira-vale', { status: 'QUEUED' });
  const assets = [
    asset(first, { status: 'SUPERSEDED' }),
    asset(second, { status: 'CANONICAL', version: 2 }),
    asset(night1),
    asset(night2, { version: 2 }),
    asset(map),
    asset(fog, { status: 'CANDIDATE' }),
    asset(discarded, { status: 'RETRACTED' }),
  ];
  return {
    lineage: {
      requests: [
        first,
        second,
        night1,
        night2,
        map,
        fog,
        snowFailed,
        stormFailed,
        stormAgain,
        rain,
        discarded,
        other,
      ],
      assets,
      canonical: [{ entityId: 'north-gate', assetId: `${second.requestId}~asset` }],
    },
    ids: {
      second: second.requestId,
      night2: night2.requestId,
      map: map.requestId,
      fog: fog.requestId,
      snow: snowFailed.requestId,
      stormAgain: stormAgain.requestId,
      rain: rain.requestId,
    },
  };
}

const english: Translate = (key, params) => translate('en', key, params);
const russian: Translate = (key, params) => translate('ru', key, params);

describe("an entity's pictures as the DM sees them", () => {
  it('shows the canonical picture and the newest approved one of each kind, never the replaced', () => {
    const { lineage, ids } = northGate();
    const images = entityImages(lineage, 'north-gate');
    expect(images.canonical).toBe(true);
    expect(images.approved.map(({ asset: shown }) => shown.requestId)).toEqual([
      ids.second,
      ids.night2,
      ids.map,
    ]);
    // The request that made it travels with it: its note is the DM's own.
    expect(images.approved[0]?.request?.note).toBe('Banners on the walls');
  });

  it('lists candidates, the work in progress, and only the failures nothing followed', () => {
    const { lineage, ids } = northGate();
    const images = entityImages(lineage, 'north-gate');
    expect(images.candidates.map(({ asset: shown }) => shown.requestId)).toEqual([ids.fog]);
    expect(images.working.map((shown) => shown.requestId)).toEqual([ids.stormAgain, ids.rain]);
    // The failed storm was asked for again: only the snow's failure still stands.
    expect(images.failed.map((shown) => shown.requestId)).toEqual([ids.snow]);
  });

  it('has nothing for an entity without pictures, and no variant to derive from', () => {
    const images = entityImages(northGate().lineage, 'tomas-reed');
    expect(images).toEqual({
      approved: [],
      candidates: [],
      working: [],
      failed: [],
      canonical: false,
    });
  });

  it('treats figures and battle maps of any label as one kind: the newest is shown', () => {
    const old = request('mira-vale', { variant: 'derived', purpose: 'figure', label: 'figure' });
    const newer = request('mira-vale', { variant: 'derived', purpose: 'figure', label: 'pose' });
    const images = entityImages(
      { requests: [old, newer], assets: [asset(old), asset(newer)], canonical: [] },
      'mira-vale',
    );
    expect(images.approved.map(({ asset: shown }) => shown.requestId)).toEqual([newer.requestId]);
  });
});

describe('the work waiting for the DM across the campaign', () => {
  it('lists each entity with candidates, requests in progress or failures, once', () => {
    const { lineage } = northGate();
    expect(pendingWork(lineage).map((work) => work.entityId)).toEqual(['north-gate', 'mira-vale']);
  });

  it('leaves out an entity whose pictures are all decided', () => {
    const done = request('orin-stonebeard');
    expect(
      pendingWork({
        requests: [done],
        assets: [asset(done, { status: 'CANONICAL' })],
        canonical: [],
      }),
    ).toEqual([]);
  });
});

describe('requests the DM can make', () => {
  it('offers what the design allows for each kind of entity', () => {
    expect(choicesFor('location')).toEqual(['reference', 'variant', 'battle-map']);
    expect(choicesFor('npc')).toEqual(['reference', 'variant', 'figure']);
    expect(choicesFor('character')).toEqual(['reference', 'variant', 'figure']);
    expect(choicesFor('creature')).toEqual(['reference', 'variant', 'figure']);
    expect(choicesFor('item')).toEqual(['reference', 'variant']);
    expect(choicesFor('faction')).toEqual(['reference']);
  });

  it('sends a purpose only when it is not an image, a label only when derived, a note only when typed', () => {
    expect(
      requestCommand('tomas-reed', kindOfChoice('reference', 'night'), 'players', '   '),
    ).toEqual({
      type: 'RequestAsset',
      entityId: 'tomas-reed',
      variant: 'reference',
      audience: 'players',
    });
    expect(
      requestCommand('north-gate', kindOfChoice('variant', 'night-rain'), 'players', ' Lanterns '),
    ).toEqual({
      type: 'RequestAsset',
      entityId: 'north-gate',
      variant: 'derived',
      label: 'night-rain',
      audience: 'players',
      note: 'Lanterns',
    });
    expect(
      requestCommand('old-trade-road', kindOfChoice('battle-map', ''), 'players', null),
    ).toEqual({
      type: 'RequestAsset',
      entityId: 'old-trade-road',
      variant: 'derived',
      label: 'map',
      purpose: 'battle-map',
      audience: 'players',
    });
    expect(requestCommand('mira-vale', kindOfChoice('figure', ''), 'dm', null)).toMatchObject({
      purpose: 'figure',
      label: 'figure',
      audience: 'dm',
    });
  });

  it('repeats a request with its kind, audience and the note the DM typed for it', () => {
    const { lineage, ids } = northGate();
    const fog = lineage.requests.find((shown) => shown.requestId === ids.fog);
    const candidate = lineage.assets.find((shown) => shown.requestId === ids.fog);
    if (!fog || !candidate) throw new Error('fixture');
    expect(repeatCommand(candidate, fog)).toEqual({
      type: 'RequestAsset',
      entityId: 'north-gate',
      variant: 'derived',
      label: 'fog',
      audience: 'players',
      note: 'Thick fog',
    });
    // A picture whose request an undo removed repeats without any note.
    expect(repeatCommand(candidate, null)).not.toHaveProperty('note');
  });

  it('asks for the same kind again on Replace', () => {
    for (const choice of ['reference', 'variant', 'figure', 'battle-map'] as const) {
      expect(choiceOfKind(kindOfChoice(choice, 'fog'))).toEqual({
        choice,
        state: choice === 'variant' ? 'fog' : null,
      });
    }
  });
});

describe('the words of the image controls', () => {
  it('names each kind of picture in both languages', () => {
    const kinds = [
      { variant: 'reference', purpose: 'image', label: null },
      { variant: 'derived', purpose: 'image', label: 'night-rain' },
      { variant: 'derived', purpose: 'figure', label: 'figure' },
      { variant: 'derived', purpose: 'battle-map', label: 'map' },
      { variant: 'derived', purpose: 'image', label: 'smiling' },
    ] as const;
    expect(kinds.map((kind) => kindWords(english, kind))).toEqual([
      'Main picture',
      'At night in the rain',
      'Figure for the battlefield',
      'Battle map',
      'Variant: smiling',
    ]);
    expect(kinds.map((kind) => kindWords(russian, kind))).toEqual([
      'Основное изображение',
      'Ночью под дождём',
      'Фигурка для поля боя',
      'Карта боя',
      'Вариант: smiling',
    ]);
  });

  it('has words in both languages for every state offered and every fixed failure', () => {
    for (const label of new Set(Object.values(STATES).flat())) {
      expect(stateWords(english, label), label).not.toBe(label);
      expect(stateWords(russian, label), label).not.toBe(stateWords(english, label));
    }
    for (const failure of ASSET_FAILURES) {
      expect(translate('ru', FAILURE_WORDS[failure]), failure).not.toBe(FAILURE_WORDS[failure]);
    }
    expect(Object.keys(JOB_WORDS).sort()).toEqual(['QUEUED', 'STARTED']);
  });
});
