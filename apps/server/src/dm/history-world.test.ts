import type { DmHistoryEntry, ScenePresentationResponse } from '@ltw/contracts';
import type { Actor, StoredCommand, WorldEngine } from '@ltw/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { CAMPAIGN, dmTable, type DmTable } from '../testing/dm-table.ts';
import { TOKENS, get, seededEngine } from '../testing/ravenford-app.ts';
import { dmHistoryPage } from './history.ts';
import { InMemorySubstitutionStore } from './substitution-store.ts';

/**
 * Time and weather in the DM history (docs/adr/0033-live-session.md, amendment of 2026-10-28):
 * the DM's own `AdvanceWorldTime` and `SetWeather` from the table, never the seed's clock nor a
 * player's refused attempt, undone as `UndoCommand` with the kernel's rules. Every later command
 * that reads the clock (a weather change anywhere included) holds a time change.
 */
const tables: DmTable[] = [];
afterEach(async () => {
  await Promise.all(tables.splice(0).map((table) => table.app.close()));
});

async function table(): Promise<DmTable> {
  const created = await dmTable();
  tables.push(created);
  return created;
}

async function sceneAt(created: DmTable, locationId: string): Promise<ScenePresentationResponse> {
  const scene = await get(
    created.app,
    `${CAMPAIGN}/locations/${locationId}/scene?perspective=DM`,
    TOKENS.dm,
  );
  return scene.json<ScenePresentationResponse>();
}

describe('time and weather entries', () => {
  it('lists the DM’s time and weather changes, never the seed’s clock, with the kernel’s undo', async () => {
    const { command, page, app } = await table();
    // The seed set the clock to Day 1 10:00 as the DM, but not at the table.
    expect((await page()).entries).toEqual([]);
    const dayTwo = { type: 'AdvanceWorldTime', to: 122_400 };
    expect((await command(dayTwo, TOKENS.dm, 'day-two')).status).toBe(200);
    const rain = { type: 'SetWeather', locationId: 'market-square', weather: 'rain' };
    expect((await command(rain, TOKENS.dm, 'rain')).status).toBe(200);

    const [wet, advanced] = (await page()).entries as [DmHistoryEntry, DmHistoryEntry];
    expect(wet).toMatchObject({
      kind: 'world',
      commandId: 'http:dm-ravenford:rain',
      change: {
        kind: 'weather',
        location: { entityId: 'market-square', kind: 'location', name: 'Market Square' },
        from: null,
        to: 'rain',
      },
      worldTime: 122_400,
      status: 'COMMITTED',
      undo: { possible: true },
    });
    // The rain was set at the new time: undoing the day waits for it, which is named.
    expect(advanced).toMatchObject({
      kind: 'world',
      commandId: 'http:dm-ravenford:day-two',
      change: { kind: 'time', from: 36_000, to: 122_400 },
      status: 'COMMITTED',
    });
    expect(advanced.undo).toEqual({
      possible: false,
      code: 'UNDO_UNSAFE',
      blockers: [
        {
          commandId: 'http:dm-ravenford:rain',
          commandType: 'SetWeather',
          sequence: wet.sequence,
        },
      ],
    });
    const undoDay = { type: 'UndoCommand', targetCommandId: advanced.commandId };
    const refused = await command(undoDay, TOKENS.dm);
    expect(refused.result).toMatchObject({ status: 'rejected', code: 'UNDO_UNSAFE' });
    expect(refused.result.status === 'rejected' && refused.result.details?.['blockers']).toEqual(
      advanced.undo?.possible === false ? advanced.undo.blockers : null,
    );

    // Newest first, as History offers: the rain, then the day; the clock is Day 1 again.
    const undoRain = { type: 'UndoCommand', targetCommandId: wet.commandId };
    expect((await command(undoRain, TOKENS.dm)).result.status).toBe('accepted');
    expect((await page()).entries[1]?.undo).toEqual({ possible: true });
    expect((await command(undoDay, TOKENS.dm)).result.status).toBe('accepted');
    expect((await page()).entries).toMatchObject([
      { commandId: 'http:dm-ravenford:rain', status: 'UNDONE', undo: null },
      { commandId: 'http:dm-ravenford:day-two', status: 'UNDONE', undo: null },
    ]);
    const scene = await get(
      app,
      `${CAMPAIGN}/locations/market-square/scene?perspective=DM`,
      TOKENS.dm,
    );
    expect(scene.json<{ worldTime: number }>().worldTime).toBe(36_000);
  });

  it('undoes a weather change back to the weather the place had before', async () => {
    const created = await table();
    const { command, page } = created;
    const at = (weather: string) => ({ type: 'SetWeather', locationId: 'market-square', weather });
    expect((await command(at('clear'), TOKENS.dm, 'clear')).status).toBe(200);
    expect((await command(at('rain'), TOKENS.dm, 'rain')).status).toBe(200);
    const [rain, clear] = (await page()).entries as [DmHistoryEntry, DmHistoryEntry];
    expect(rain).toMatchObject({ change: { from: 'clear', to: 'rain' }, undo: { possible: true } });
    // The rain replaced the clear sky: the earlier change waits for it.
    expect(clear).toMatchObject({
      change: { from: null, to: 'clear' },
      undo: { possible: false, code: 'UNDO_UNSAFE', blockers: [{ commandId: rain.commandId }] },
    });
    const undo = { type: 'UndoCommand', targetCommandId: rain.commandId };
    expect((await command(undo, TOKENS.dm)).result.status).toBe('accepted');
    expect((await sceneAt(created, 'market-square')).location.weather).toBe('clear');
    expect((await page()).entries[1]?.undo).toEqual({ possible: true });
  });

  it('holds a time change by a later weather change at any place, as it reads the clock', async () => {
    const { command, page } = await table();
    expect((await command({ type: 'AdvanceWorldTime', by: 3_600 }, TOKENS.dm, 'hour')).status).toBe(
      200,
    );
    const fog = { type: 'SetWeather', locationId: 'north-gate', weather: 'fog' };
    expect((await command(fog, TOKENS.dm, 'fog')).status).toBe(200);
    const [, hour] = (await page()).entries as [DmHistoryEntry, DmHistoryEntry];
    expect(hour).toMatchObject({
      change: { kind: 'time', from: 36_000, to: 39_600 },
      undo: {
        possible: false,
        code: 'UNDO_UNSAFE',
        blockers: [{ commandId: 'http:dm-ravenford:fog', commandType: 'SetWeather' }],
      },
    });
  });

  it('never lists a player’s attempt, which is forbidden', async () => {
    const { command, page } = await table();
    for (const attempt of [
      { type: 'AdvanceWorldTime', to: 122_400 },
      { type: 'SetWeather', locationId: 'market-square', weather: 'storm' },
    ]) {
      const sent = await command(attempt, TOKENS.player);
      expect(sent.status, attempt.type).toBe(403);
      expect(sent.result).toMatchObject({ error: { code: 'FORBIDDEN' } });
    }
    expect((await page()).entries).toEqual([]);
  });

  it('leaves out, and logs, a time command whose recorded event is not its change', async () => {
    const engine = await seededEngine();
    const dm: Actor = { actorId: 'dm-ravenford', kind: 'user' };
    for (const [id, to] of [
      ['odd', 122_400],
      ['fine', 208_800],
    ] as const) {
      const result = await engine.execute({
        commandId: `http:dm-ravenford:${id}`,
        campaignId: 'ravenford',
        actor: dm,
        command: { type: 'AdvanceWorldTime', to },
      });
      expect(result.status).toBe('accepted');
    }
    const snapshot = await engine.load('ravenford');
    if (!snapshot) throw new Error('no Ravenford');
    // Fault injection: the log points the command at the campaign's first event.
    const forged = {
      commandLog: async (campaignId: string): Promise<readonly StoredCommand[]> =>
        (await engine.commandLog(campaignId)).map((stored) =>
          stored.commandId === 'http:dm-ravenford:odd'
            ? { ...stored, firstSequence: 1, lastSequence: 1 }
            : stored,
        ),
    } as unknown as WorldEngine;
    const warnings: unknown[][] = [];
    const page = await dmHistoryPage(
      forged,
      new InMemorySubstitutionStore(),
      snapshot,
      dm,
      'ravenford',
      undefined,
      { warn: (...args: unknown[]) => warnings.push(args) } as never,
    );
    expect(page.entries.map((entry) => entry.commandId)).toEqual(['http:dm-ravenford:fine']);
    expect(warnings).toEqual([
      [
        { commandId: 'http:dm-ravenford:odd', commandType: 'AdvanceWorldTime' },
        'dm history change not recorded',
      ],
    ]);
  });
});
