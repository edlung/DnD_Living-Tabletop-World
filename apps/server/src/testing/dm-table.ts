import type { CommandResult, DmHistoryResponse } from '@ltw/contracts';
import type { WorldEngine } from '@ltw/domain';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

import ambush from '../../../../fixtures/ravenford/road-ambush.json' with { type: 'json' };
import type { AuthoringDependencies } from '../authoring/service.ts';
import type { DmDependencies } from '../dm/dm-routes.ts';
import {
  TOKENS,
  get,
  post,
  ravenfordApp,
  seededEngine,
  testAiGateway,
  testAssets,
  testAuthoring,
  testDm,
} from './ravenford-app.ts';

/**
 * Test support (excluded from builds): the DM's table tools over HTTP (docs/adr/0033-live-session.md
 * §6–7). Every combat die rolls 11, so the ambush's order is Elowen, the Raiders, the Shaman.
 */
export const CAMPAIGN = '/campaigns/ravenford';
export const ELOWEN = 'elowen-starwhisper';

export interface DmTable {
  readonly app: FastifyInstance;
  readonly engine: WorldEngine;
  readonly dm: DmDependencies;
  readonly authoring: AuthoringDependencies;
  /** `POST …/commands` with a client command ID (a fresh one unless given). */
  readonly command: (
    command: Record<string, unknown>,
    token: string,
    clientCommandId?: string,
  ) => Promise<{ readonly status: number; readonly result: CommandResult }>;
  /** `POST …/dm/substitutions`. */
  readonly substitute: (
    body: Record<string, unknown>,
    token: string,
  ) => Promise<LightMyRequestResponse>;
  /** `GET …/dm/history?<query>`. */
  readonly history: (token: string | undefined, query?: string) => Promise<LightMyRequestResponse>;
  /** The DM's history page, which must be served. */
  readonly page: (query?: string) => Promise<DmHistoryResponse>;
  /** Places the goblins and starts the Old Trade Road ambush: Elowen's turn. */
  readonly startAmbush: () => Promise<void>;
  /** The DM's reason for Elowen, then the command with the same client command ID. */
  readonly standIn: (
    clientCommandId: string,
    command: Record<string, unknown>,
    reason?: Record<string, unknown>,
  ) => Promise<{ readonly status: number; readonly result: CommandResult }>;
}

export async function dmTable(
  options: {
    readonly engine?: WorldEngine;
    readonly dm?: DmDependencies;
    readonly authoring?: AuthoringDependencies;
  } = {},
): Promise<DmTable> {
  const engine = options.engine ?? (await seededEngine());
  const dm = options.dm ?? testDm();
  const authoring = options.authoring ?? testAuthoring();
  const app = await ravenfordApp(engine, testAiGateway(), authoring, testAssets().contents, dm);
  let counter = 0;
  const command: DmTable['command'] = async (body, token, clientCommandId) => {
    counter += 1;
    const response = await post(
      app,
      `${CAMPAIGN}/commands`,
      { commandId: clientCommandId ?? `table-${String(counter)}`, command: body },
      token,
    );
    return { status: response.statusCode, result: response.json<CommandResult>() };
  };
  const substitute: DmTable['substitute'] = (body, token) =>
    post(app, `${CAMPAIGN}/dm/substitutions`, body, token);
  const history: DmTable['history'] = (token, query = 'perspective=DM') =>
    get(app, `${CAMPAIGN}/dm/history?${query}`, token);
  return {
    app,
    engine,
    dm,
    authoring,
    command,
    substitute,
    history,
    page: async (query) => {
      const response = await history(TOKENS.dm, query);
      if (response.statusCode !== 200) throw new Error(`history ${String(response.statusCode)}`);
      return response.json<DmHistoryResponse>();
    },
    startAmbush: async () => {
      for (const step of [...ambush.place, ambush.startCombat]) {
        const sent = await command(step, TOKENS.dm);
        if (sent.status !== 200) throw new Error(`ambush step ${step.type} was refused`);
      }
    },
    standIn: async (clientCommandId, body, reason = { reason: 'absent' }) => {
      const recorded = await substitute(
        { clientCommandId, characterId: ELOWEN, ...reason },
        TOKENS.dm,
      );
      if (recorded.statusCode >= 300) throw new Error(`reason ${String(recorded.statusCode)}`);
      return command(body, TOKENS.dm, clientCommandId);
    },
  };
}
