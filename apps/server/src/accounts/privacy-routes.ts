import { ACCOUNT_COOKIE, deleteAccountRequestSchema } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';

import { iso } from '../auth/session-authenticator.ts';
import { clearedCookie, clearedSessionCookie, secureCookies } from '../auth/tokens.ts';
import { sendError } from '../http/errors.ts';
import { clientGroup } from '../platform/net/addresses.ts';
import type { AccountRouteDependencies } from './account-routes.ts';
import { conflict } from './account-routes.ts';
import { accountOf } from './accounts.ts';
import { verifyPassword } from './passwords.ts';
import { accountData, forgetAccount, type PrivacyDependencies } from './privacy.ts';

/**
 * A person's data from the account's page (docs/adr/0062-account-privacy.md §2–3):
 * - `GET /account/data`: a copy, as a JSON file to save;
 * - `POST /account/delete`: the account forgotten, with its password and its login typed again;
 *   a DM's account is the operator's to delete (409 `dm-seat`), so no campaign loses its DM here.
 * Signed in to the account (its cookie), like the rest of the account's page.
 */
export function registerPrivacyRoutes(
  app: FastifyInstance,
  deps: AccountRouteDependencies & Pick<PrivacyDependencies, 'chat' | 'table'>,
): void {
  const { accounts, accountLimits, credentials, clock } = deps.signIn;
  const privacy: PrivacyDependencies = {
    engine: deps.engine,
    accounts,
    credentials,
    chat: deps.chat,
    table: deps.table,
  };
  const secure = secureCookies(deps.signIn.publicOrigin);

  app.get('/account/data', async (request, reply) => {
    const current = await accountOf(deps.signIn, request.headers.cookie);
    if (!current) return sendError(reply, request, 'UNAUTHENTICATED');
    const data = await accountData(privacy, current.account, iso(clock.now()));
    const day = data.exportedAt.slice(0, 10);
    request.log.info({ accountId: current.account.accountId }, 'account data copied');
    return reply
      .header(
        'content-disposition',
        `attachment; filename="ltw-${current.account.login}-${day}.json"`,
      )
      .send(data);
  });

  app.post('/account/delete', async (request, reply) => {
    const current = await accountOf(deps.signIn, request.headers.cookie);
    if (!current) return sendError(reply, request, 'UNAUTHENTICATED');
    const body = deleteAccountRequestSchema.safeParse(request.body);
    if (!body.success) return sendError(reply, request, 'INVALID_REQUEST');
    const { account } = current;
    if (!accountLimits.signIn(clientGroup(request.ip), account.login)) {
      return sendError(reply, request, 'RATE_LIMITED');
    }
    const sameLogin = body.data.login.trim().toLowerCase() === account.login;
    if (!sameLogin || !(await verifyPassword(body.data.password, account.passwordHash))) {
      accountLimits.failed(account.login);
      return sendError(reply, request, 'FORBIDDEN');
    }
    if ((await accounts.seats(account.accountId)).some((seat) => seat.role === 'dm')) {
      return conflict(reply, request, 'dm-seat');
    }
    if (!(await forgetAccount(privacy, account.accountId, iso(clock.now())))) {
      return sendError(reply, request, 'INTERNAL');
    }
    request.log.info({ accountId: account.accountId }, 'account deleted');
    return reply
      .code(204)
      .header('set-cookie', [clearedCookie(ACCOUNT_COOKIE, secure), clearedSessionCookie(secure)])
      .send();
  });
}
