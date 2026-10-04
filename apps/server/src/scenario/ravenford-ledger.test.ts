import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { QuestListResponse } from '@ltw/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RAVENFORD_LEDGER, type Evidence } from '../testing/scenario/ledger.ts';
import { playDayOne } from '../testing/scenario/play-day-one.ts';
import { playRoad } from '../testing/scenario/play-road.ts';
import { BASE, CAMPAIGN, RavenfordSession } from '../testing/scenario/session.ts';

/**
 * Ravenford's required command and event semantics (RAVENFORD_SPEC.md,
 * Minimum Commands and Minimum Events; ADR 0025 §1). Every name the spec
 * lists has a ledger entry naming its accepted equivalent and ADR, and every
 * entry's check holds over one played session: nothing is unavailable.
 */
const SPEC = fileURLToPath(new URL('../../../../RAVENFORD_SPEC.md', import.meta.url));

async function minimum(section: 'Commands' | 'Events'): Promise<string[]> {
  const text = await readFile(SPEC, 'utf8');
  const body = text.split(`## Minimum ${section}`)[1]?.trim().split('\n\n')[0] ?? '';
  return body
    .split(';')
    .map((name) => name.trim().replace(/\.$/, ''))
    .filter((name) => name.length > 0);
}

let session: RavenfordSession;
let evidence: Evidence;

beforeAll(async () => {
  session = await RavenfordSession.open();
  await playDayOne(session);
  const road = await playRoad(session);
  const snapshot = await session.snapshot();
  const commandLog = await session.engine.commandLog(CAMPAIGN);
  const undone = new Set(
    commandLog
      .filter((c) => snapshot.state.commands.get(c.commandId)?.undoneBy)
      .map((c) => c.commandId),
  );
  evidence = {
    events: new Set(
      snapshot.history.filter((e) => !undone.has(e.causation.commandId)).map((e) => e.type),
    ),
    commands: new Set(commandLog.filter((c) => !undone.has(c.commandId)).map((c) => c.commandType)),
    commandLog,
    snapshot,
    exchanges: session.exchanges,
    quests: road.quests satisfies QuestListResponse,
  };
}, 60_000);

afterAll(async () => {
  await session.close();
});

describe('the Ravenford semantics ledger', () => {
  it('names every minimum command and event of the spec, and nothing else but the asset request', async () => {
    const required = [...(await minimum('Commands')), ...(await minimum('Events'))];
    expect(required).toHaveLength(19 + 26);
    const listed = RAVENFORD_LEDGER.map((entry) => entry.name);
    expect([...listed].sort()).toEqual([...required, 'ASSET_GENERATION_REQUESTED'].sort());
  });

  it.each(RAVENFORD_LEDGER.map((entry) => [entry.name, entry] as const))(
    '%s holds in the played session',
    (_name, entry) => {
      expect(entry.equivalent.length).toBeGreaterThan(0);
      expect(entry.adr).toMatch(/^\d{4}/);
      expect(entry.check(evidence)).toBe(true);
    },
  );

  it('reads the quest log only through its route', () => {
    expect(evidence.exchanges.some((x) => x.url.startsWith(`${BASE}/quests`))).toBe(true);
  });
});
