import type {
  ChronicleListResponse,
  CommandResult,
  EncounterResponse,
  EntityContextResponse,
  FlashbackResponse,
  GenerateChronicleResponse,
  MemoryRecallResponse,
  MemorySuggestionsResponse,
  NpcDialogueResponse,
  QuestListResponse,
  ScenePresentationResponse,
} from '@ltw/contracts';

import ambush from '../../../../../fixtures/ravenford/road-ambush.json' with { type: 'json' };
import dayTwo from '../../../../../fixtures/ravenford/day-two.json' with { type: 'json' };
import { contextOf, ok } from './play-day-one.ts';
import { EN_SCRIPT } from './script.ts';
import { BASE, ELOWEN, type RavenfordSession } from './session.ts';

/**
 * Test support: the Old Trade Road ambush with its Counterspell, the
 * return, Day 2, the Chronicle, and the quest log (RAVENFORD_SPEC.md,
 * Combat Encounter → Chronicle). Combat dice sit at their middle face, so
 * the order is Elowen, the Raiders, then the Shaman.
 */
export const CHAPTER_TITLE = EN_SCRIPT.chapterTitle;
const RAIDERS = ['creature-10fb59d4', 'creature-589f6668', 'creature-6513bec0'];

export interface Road {
  readonly raiderContext: EntityContextResponse;
  readonly attack: CommandResult;
  readonly windowView: EncounterResponse;
  readonly counterspell: CommandResult;
  readonly lateCounterspell: CommandResult;
  readonly fireball: CommandResult;
  readonly miraAfter: EntityContextResponse;
  readonly talkAfter: NpcDialogueResponse;
  readonly squareDayOne: ScenePresentationResponse;
  readonly squareDayTwo: ScenePresentationResponse;
  readonly suggestions: MemorySuggestionsResponse;
  readonly chapter: GenerateChronicleResponse;
  readonly chronicle: ChronicleListResponse;
  readonly miraFlashback: FlashbackResponse;
  readonly battleFlashback: FlashbackResponse;
  readonly quests: QuestListResponse;
}

const encounterOf = async (session: RavenfordSession, persona: 'dm' | 'player') =>
  ok(
    await session.get(
      persona,
      `${BASE}/encounter?perspective=${persona === 'dm' ? 'DM' : 'PLAYER'}`,
    ),
  ).json<EncounterResponse>();

/**
 * The ambush up to the Shaman's spell: Elowen's Longbow shot (cover, damage,
 * Slowed), the Raiders' turns, then Binding Hex at Elowen, which opens a
 * Counterspell window. Returns the window for the player to answer.
 */
export async function ambushUntilTheHex(session: RavenfordSession): Promise<{
  readonly raiderContext: EntityContextResponse;
  readonly attack: CommandResult;
  readonly windowView: EncounterResponse;
  readonly windowId: string;
}> {
  session.phase('combat');
  await session.dm({ type: 'AdvanceWorldTime', by: 3_600 });
  for (const place of ambush.place) await session.dm(place);
  await session.dm(ambush.startCombat);
  ok(await session.get('player', `${BASE}/encounter?perspective=PLAYER`));
  const raiderContext = await contextOf(session, 'creature-10fb59d4');

  // Round 1: a Longbow shot at the Shaman (cover, damage, Slowed); the Raiders wait.
  const attack = await session.command('player', {
    type: 'Attack',
    combatantId: ELOWEN,
    attackId: 'longbow',
    targetId: 'creature-ae08be99',
  });
  await session.command('player', { type: 'EndTurn', combatantId: ELOWEN });
  for (const raider of RAIDERS) await session.dm({ type: 'EndTurn', combatantId: raider });
  // The Shaman casts at Elowen, which opens a Counterspell window for her.
  await session.dm({
    type: 'CastSpell',
    combatantId: 'creature-ae08be99',
    spellId: 'binding-hex',
    targetId: ELOWEN,
  });
  const windowView = await encounterOf(session, 'player');
  const windowId = windowView.encounter?.reactionWindow?.windowId ?? '';
  return { raiderContext, attack, windowView, windowId };
}

export async function playRoad(session: RavenfordSession): Promise<Road> {
  const { raiderContext, attack, windowView, windowId } = await ambushUntilTheHex(session);
  // Elowen counters (CAST); a second answer is refused.
  const counterspell = await session.command('player', {
    type: 'UseReaction',
    combatantId: ELOWEN,
    windowId,
    reaction: 'counterspell',
  });
  const lateCounterspell = await session.command(
    'player',
    { type: 'UseReaction', combatantId: ELOWEN, windowId, reaction: 'counterspell' },
    422,
  );
  await session.dm({ type: 'EndTurn', combatantId: 'creature-ae08be99' });

  // Round 2: Fireball on the ambushers ends the fight.
  const fireball = await session.command('player', {
    type: 'CastSpell',
    combatantId: ELOWEN,
    spellId: 'fireball',
    point: { x: 10, y: 6 },
  });
  // Elowen steps out from the road's edge before the DM ends the fight.
  await session.command('player', {
    type: 'MoveCombatant',
    combatantId: ELOWEN,
    path: [{ x: 3, y: 6 }],
  });
  const encounterId = (await encounterOf(session, 'dm')).encounter?.encounterId;
  await session.dm({ type: 'EndCombat', encounterId });

  // The return to Ravenford: Mira's context reflects what the party found.
  session.phase('return');
  await session.dm({ type: 'AdvanceWorldTime', by: 3_600 });
  await session.act({ type: 'EnterLocation', locationId: 'market-square' });
  // Mira warms to the party that went looking for her caravan.
  await session.dm({ type: 'SetRelationship', npcId: 'mira-vale', attitude: 'FRIENDLY' });
  const miraAfter = await contextOf(session, 'mira-vale');
  const talkAfter = ok(
    await session.post('player', `${BASE}/npcs/mira-vale/dialogue`, {
      characterId: ELOWEN,
      intent: { kind: 'talk' },
    }),
  ).json<NpcDialogueResponse>();

  // Day 2: clear skies over the afternoon, then rain the next morning.
  session.phase('day-two');
  for (const step of dayTwo.commands) await session.dm(step);
  const afternoon = (await session.snapshot()).history.find(
    (event) => event.type === 'WeatherSet' && event.payload.to === 'clear',
  )?.worldTime;
  const scene = async (at: number) =>
    ok(
      await session.get(
        'player',
        `${BASE}/locations/market-square/scene?perspective=PLAYER&at=${String(at)}`,
      ),
    ).json<ScenePresentationResponse>();
  const squareDayOne = await scene(afternoon ?? 0);
  const squareDayTwo = await scene((await session.snapshot()).state.clock);

  // The Chronicle: the DM records the moments the party lived, then tells Chapter I.
  session.phase('chronicle');
  const suggestions = ok(
    await session.get('dm', `${BASE}/chronicle/suggestions?from=0`),
  ).json<MemorySuggestionsResponse>();
  for (const suggestion of suggestions.suggestions) await session.dm({ ...suggestion.command });
  const chapter = ok(
    await session.post('dm', `${BASE}/chronicle`, {
      title: session.script.chapterTitle,
      perspective: 'PARTY',
      from: 0,
    }),
  ).json<GenerateChronicleResponse>();
  const chronicle = ok(
    await session.get('player', `${BASE}/chronicle?perspective=PARTY`),
  ).json<ChronicleListResponse>();
  const flashback = async (memoryId: string) =>
    ok(
      await session.get('player', `${BASE}/memories/${memoryId}/flashback?perspective=PARTY`),
    ).json<FlashbackResponse>();
  const memories = ok(
    await session.get(
      'player',
      `${BASE}/memories?perspective=PARTY&q=${encodeURIComponent(session.script.battleQuery)}`,
    ),
  ).json<MemoryRecallResponse>();
  const battle = memories.memories.find((m) =>
    m.memory.summary.startsWith(session.script.battlePrefix),
  );
  if (!battle) throw new Error('the party remembers no fight');
  const miraFlashback = await flashback('mem-party-talk-mira');
  const battleFlashback = await flashback(battle.memory.memoryId);

  session.phase('quests');
  const quests = ok(
    await session.get('player', `${BASE}/quests?perspective=PARTY`),
  ).json<QuestListResponse>();
  return {
    raiderContext,
    attack,
    windowView,
    counterspell,
    lateCounterspell,
    fireball,
    miraAfter,
    talkAfter,
    squareDayOne,
    squareDayTwo,
    suggestions,
    chapter,
    chronicle,
    miraFlashback,
    battleFlashback,
    quests,
  };
}
