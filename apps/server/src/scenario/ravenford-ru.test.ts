import { createCombatEngine } from '@ltw/combat';
import type { KnowledgeListResponse, MemoryRecallResponse } from '@ltw/contracts';
import {
  checkWorldIntegrity,
  parseRecordedEvent,
  redecideEffective,
  replay,
  type RecordedEvent,
} from '@ltw/domain';
import { skillModifier } from '@ltw/rules';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { partyKnowledge, playDayOne, type DayOne } from '../testing/scenario/play-day-one.ts';
import { playRoad, type Road } from '../testing/scenario/play-road.ts';
import { RU_SCRIPT } from '../testing/scenario/script-ru.ts';
import { BASE, CAMPAIGN, RavenfordSession } from '../testing/scenario/session.ts';

/**
 * The Stage 180 slice played in Russian (docs/adr/0031-play-language.md): the same routes, the
 * same IDs, and the Russian Ravenford. It checks that every sentence the World Engine
 * recorded is Russian, that the language-dependent rules (hedging, recall) work in Russian,
 * and that the player never receives a secret in either language.
 */
let session: RavenfordSession;
let one: DayOne;
let road: Road;

beforeAll(async () => {
  session = await RavenfordSession.open({ script: RU_SCRIPT });
  one = await playDayOne(session);
  road = await playRoad(session);
}, 60_000);

afterAll(async () => {
  await session.close();
});

const CYRILLIC = /[Ѐ-ӿ]/u;
const LATIN_WORDS = /[A-Za-z]{3,}/u;

describe('the Russian campaign', () => {
  it('is a Russian campaign for the session view, and keeps its language in state', async () => {
    expect((await session.snapshot()).state.campaign?.language).toBe('ru');
    const view = (await session.get('player', `${BASE}/session`)).json<{
      campaign: { language: string };
      perspectives: { label: string }[];
    }>();
    expect(view.campaign.language).toBe('ru');
    expect(view.perspectives.map((p) => p.label)).toEqual(
      expect.arrayContaining(['Игрок · Эловен Старвиспер', 'Отряд', 'Публичный вид']),
    );
  });

  it('records every sentence the engine wrote in Russian, with no English template left', async () => {
    const { state } = await session.snapshot();
    // Gate 04's planted markers (NBX…) are English by design; every other memory is the engine's or the seed's.
    const recorded = [...state.memories.values()]
      .map((memory) => memory.summary)
      .filter((text) => !text.includes('NBX'));
    expect(recorded.length).toBeGreaterThan(10);
    for (const text of recorded) {
      expect(text, text).toMatch(CYRILLIC);
      // Latin letters may only come from an entity name the DM or a boundary fixture typed.
      expect(text.replace(/NBX\w+|[A-Za-z]+-\d+/g, ''), text).not.toMatch(LATIN_WORDS);
    }
    const heard = recorded.filter((text) => text.startsWith('Беседа.'));
    expect(heard.length).toBeGreaterThan(0);
  });

  it('keeps the goblin theory a hypothesis and surfaces the contradiction without blaming', async () => {
    const knowledge = await partyKnowledge(session);
    const goblins = knowledge.find((r) => r.statement === 'Караван атаковали гоблины.');
    expect(goblins?.knowledgeType).toBe('HYPOTHESIS');
    const contradiction = knowledge.find((r) => r.knowledgeType === 'CONTRADICTION');
    expect(contradiction?.statement).toMatch(/расходятся/u);
    expect(contradiction?.statement).not.toMatch(/лж|обман|вр[её]т|правд|неправд/iu);
    expect(contradiction?.statement).toMatch(CYRILLIC);
  });

  it('creates Tomas from a Russian sentence, as a native person, and performs him', async () => {
    expect(one.commit.json<{ status: string }>()).toMatchObject({ status: 'accepted' });
    expect((await session.snapshot()).state.entities.get(one.tomasId)?.name).toBe('Томас Рид');
    expect(one.performed.reply).toMatchObject({ status: 'REPLIED', canonical: false });
    expect(one.performed.reply?.text).toMatch(CYRILLIC);
    expect(one.askMira.reply?.text).toMatch(CYRILLIC);
  });
});

describe('recall and the Chronicle in Russian', () => {
  it('recalls a memory by a Russian word in another case', async () => {
    const recalled = (
      await session.get(
        'player',
        `${BASE}/memories?perspective=PARTY&q=${encodeURIComponent('каравана')}`,
      )
    ).json<MemoryRecallResponse>();
    const texts = recalled.memories.map((m) => m.memory.summary);
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.some((text) => text.includes('караван'))).toBe(true);
  });

  it('tells Chapter I in Russian; every account is told as an account', () => {
    expect(road.chapter).toMatchObject({
      result: { status: 'accepted' },
      rendering: { status: 'RENDERED' },
    });
    const [chapter] = road.chronicle.chapters;
    expect(chapter?.title).toBe(RU_SCRIPT.chapterTitle);
    const texts = chapter?.entries.map((e) => e.text) ?? [];
    expect(texts).toEqual(
      expect.arrayContaining([
        'Мира рассказала нам, что караван ушёл до рассвета.',
        'Бой. Место: Старая Торговая дорога. Противники: 4. Пало: 4. Заклинание отражено.',
        'Возвращение: Равенфорд.',
        'Начался день 2.',
      ]),
    );
    for (const paragraph of chapter?.prose.paragraphs ?? []) {
      expect(paragraph.text, paragraph.text).toMatch(CYRILLIC);
    }
    expect(chapter?.prose.paragraphs.some((p) => /Со слов рассказчика/u.test(p.text))).toBe(true);
  });

  it('opens the fight as a flashback in Russian', () => {
    expect(road.battleFlashback.participants.map((p) => p.entity.entityId)).toContain(
      'creature-ae08be99',
    );
    expect(road.battleFlashback.scene?.entityId).toBe('old-trade-road');
  });
});

describe('the whole Russian session', () => {
  it('never sent the player a secret, in either language', async () => {
    for (const perspective of ['PLAYER', 'PARTY', 'PUBLIC']) {
      (
        await session.get('player', `${BASE}/knowledge?perspective=${perspective}`)
      ).json<KnowledgeListResponse>();
    }
    const seen = session.seenBy('player');
    expect(seen.length).toBeGreaterThan(40);
    for (const body of seen) {
      for (const marker of RU_SCRIPT.neverForPlayers) expect(body, marker).not.toContain(marker);
    }
  });

  it('leaves a consistent world: integrity, the re-decision oracle, and replay from stored JSON', async () => {
    const snapshot = await session.snapshot();
    expect(checkWorldIntegrity(snapshot.state)).toEqual([]);
    const log = await session.engine.commandLog(CAMPAIGN);
    expect(redecideEffective(log, snapshot, skillModifier, createCombatEngine())).toBeNull();
    const stored = (JSON.parse(JSON.stringify(snapshot.history)) as unknown[]).map(
      parseRecordedEvent,
    );
    expect(replay(stored)).toEqual(snapshot.state);
    // Recorded text replays as recorded: it is read from the events, never regenerated.
    const created = snapshot.history.find(
      (e): e is Extract<RecordedEvent, { type: 'CampaignCreated' }> => e.type === 'CampaignCreated',
    );
    expect(created?.payload.language).toBe('ru');
  });
});
