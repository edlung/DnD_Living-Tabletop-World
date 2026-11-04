import { randomBytes } from 'node:crypto';

import type {
  AccountCampaignData,
  AccountChatLine,
  AccountDataResponse,
  AccountRollLine,
} from '@ltw/contracts';
import type { WorldEngine } from '@ltw/domain';

import type { CredentialStore } from '../auth/credential-store.ts';
import type { ChatStore } from '../chat/chat-store.ts';
import type { TableStore } from '../dice/table-store.ts';
import type { AccountRecord, AccountStore } from './account-store.ts';
import { campaignsOf } from './accounts.ts';
import { hashPassword } from './passwords.ts';

/**
 * A person's data (docs/adr/0062-account-privacy.md §2–3): a copy of what the account holds and
 * wrote, and the account forgotten. The copy has the account, its sign-ins (when, never a token),
 * and for each campaign its characters, the chat it wrote and the rolls it made: a player's as
 * their characters, a DM's as the DM (or the people and creatures the DM plays). Never a password
 * hash, a token or anyone else's message.
 */
export interface PrivacyDependencies {
  readonly engine: WorldEngine;
  readonly accounts: AccountStore;
  readonly credentials: CredentialStore;
  readonly chat: ChatStore;
  readonly table: TableStore;
}

/** How much of a campaign's chat and rolls a copy reads: the newest, when there are more. */
const HISTORY_LIMIT = 10_000;
/** A forgotten account's name, as the table sees it. */
export const FORGOTTEN_NAME = 'Deleted account';

export async function accountData(
  deps: PrivacyDependencies,
  account: AccountRecord,
  now: string,
): Promise<AccountDataResponse> {
  const campaigns: AccountCampaignData[] = [];
  for (const campaign of await campaignsOf(
    deps.engine,
    await deps.accounts.seats(account.accountId),
  )) {
    const state = (await deps.engine.load(campaign.campaignId))?.state ?? null;
    const own = new Set(campaign.characters.map((character) => character.entityId));
    // A DM speaks and rolls as the DM (null) or as anyone the players do not play.
    const theirs = (who: string | null) =>
      campaign.role === 'dm'
        ? who === null || !(state?.roster.has(who) ?? false)
        : who !== null && own.has(who);
    const named = (who: string | null) =>
      who === null ? null : (state?.entities.get(who)?.name ?? who);
    const chat: AccountChatLine[] = (await deps.chat.recent(campaign.campaignId, HISTORY_LIMIT))
      .filter((line) => theirs(line.speakerId))
      .map((line) => ({
        at: line.at,
        channel: line.channel,
        voice: line.voice,
        speaker: named(line.speakerId),
        text: line.text,
      }));
    const rolls: AccountRollLine[] = (
      await deps.table.recentRolls(campaign.campaignId, HISTORY_LIMIT)
    )
      .filter((roll) => theirs(roll.rollerId))
      .map((roll) => ({
        at: roll.at,
        roller: named(roll.rollerId),
        subject: roll.subject,
        groups: roll.groups,
      }));
    campaigns.push({
      campaignId: campaign.campaignId,
      name: campaign.name,
      role: campaign.role,
      language: campaign.language,
      characters: campaign.characters,
      chat,
      rolls,
    });
  }
  const sessions = (await deps.accounts.sessionsOf(account.accountId)).map((session) => ({
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt,
  }));
  return {
    exportedAt: now,
    account: {
      login: account.login,
      displayName: account.displayName,
      createdAt: account.createdAt,
      passwordChangedAt: account.passwordChangedAt,
    },
    sessions,
    campaigns,
  };
}

/**
 * Forgets the person behind an account: the campaign sessions of its seats end, then the account
 * keeps nothing of them (`AccountStore.forget`). The characters stay in their worlds: the DM sees
 * their seats empty. False when no free login was found (nothing is written then).
 */
export async function forgetAccount(
  deps: Pick<PrivacyDependencies, 'accounts' | 'credentials'>,
  accountId: string,
  now: string,
): Promise<boolean> {
  for (const seat of await deps.accounts.seats(accountId)) {
    await deps.credentials.revokeActorSessions(seat.campaignId, seat.actorId, now);
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const replacement = {
      login: `deleted-${randomBytes(5).toString('hex')}`,
      displayName: FORGOTTEN_NAME,
      // A password nobody was ever told.
      passwordHash: await hashPassword(randomBytes(32).toString('base64url')),
    };
    if (await deps.accounts.forget(accountId, replacement, now)) return true;
  }
  return false;
}
