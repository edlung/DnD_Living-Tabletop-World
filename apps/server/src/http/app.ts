import { randomUUID } from 'node:crypto';

import type { RelevanceDeps } from '@ltw/ai';
import type { Language, QuestDefinition } from '@ltw/contracts';
import type { WorldEngine } from '@ltw/domain';
import Fastify, { LogController, type FastifyBaseLogger, type FastifyInstance } from 'fastify';

import type { AssetContentStore } from '../assets/content-store.ts';
import { registerWorkshopRoutes } from '../workshop/routes.ts';
import type { WorkshopDependencies } from '../workshop/service.ts';
import type { CampaignQuestBooks } from '../campaigns/quest-books.ts';
import { registerAccountRoutes } from '../accounts/account-routes.ts';
import { registerChatRoutes, type ChatDependencies } from '../chat/chat-routes.ts';
import { InMemoryMarkStore } from '../marks/mark-store.ts';
import { registerMarkRoutes, type MarkDependencies } from '../marks/mark-routes.ts';
import { InMemoryChatStore } from '../chat/chat-store.ts';
import { registerHandoutRoutes, type HandoutDependencies } from '../handouts/handout-routes.ts';
import { InMemoryHandoutStore } from '../handouts/handout-store.ts';
import { registerLibraryRoutes } from '../library/library-routes.ts';
import type { AdventureBooks, AdventurePictures } from '../adventures/adventures.ts';
import { registerLobbyRoutes } from '../table/lobby-routes.ts';
import { registerMusicRoutes } from '../music/music-routes.ts';
import { registerVoiceRoutes, type VoiceRelay } from '../voice/voice-routes.ts';
import { VoiceRooms } from '../voice/voice-rooms.ts';
import { InMemoryTrackStore, type TrackStore } from '../music/track-store.ts';
import { memoryLobby, type LobbyDependencies } from '../table/table-state.ts';
import { registerDisplayRoutes } from '../display/display-routes.ts';
import { registerTableLinkRoutes } from '../display/table-links.ts';
import { registerAuthRoutes } from '../auth/auth-routes.ts';
import { registerMemberRoutes } from '../auth/member-routes.ts';
import type { SignInDependencies } from '../auth/sign-in.ts';
import type { AuthoringDependencies } from '../authoring/service.ts';
import { registerDmRoutes, type DmDependencies } from '../dm/dm-routes.ts';
import type { TableDependencies } from '../dice/roll-access.ts';
import { registerRollRoutes } from '../dice/roll-routes.ts';
import { serverDice } from '../dice/table-rolls.ts';
import { InMemoryRestStore, InMemoryTableStore } from '../dice/table-store.ts';
import { registerRestRoutes } from '../rest/rest-routes.ts';
import { registerPresenceRoutes } from '../live/presence.ts';
import { NOBODY_CONNECTED, type PresenceSource } from '../live/registry.ts';
import { processReadiness, type ReadinessProbe } from '../platform/health/readiness.ts';
import { LOG_SERIALIZERS, type Logger } from '../platform/logging/logger.ts';
import type { Authenticator } from './auth.ts';
import { sendError } from './errors.ts';
import { registerAiRoutes, type AiRouteDependencies } from './routes/ai-routes.ts';
import { registerAssetRoutes } from './routes/asset-routes.ts';
import { registerBattleMapUploadRoutes } from '../images/battle-map-upload.ts';
import { registerChronicleRoutes } from './routes/chronicle-routes.ts';
import { registerCharacterRoutes } from './routes/character-routes.ts';
import { registerAuthoringRoutes } from './routes/authoring-routes.ts';
import { registerCommandRoutes } from './routes/command-routes.ts';
import { registerContextRoutes } from './routes/context-routes.ts';
import {
  registerPreparedEncounterRoutes,
  type PreparedEncounterBooks,
} from '../combat/prepared-encounters.ts';
import { registerBestiaryRoutes } from '../combat/bestiary-routes.ts';
import { registerSavedEncounterRoutes } from '../combat/saved-encounters.ts';
import { registerAttuneRoutes } from '../items/attune-routes.ts';
import { registerItemCatalogRoutes } from '../items/item-catalog-routes.ts';
import { registerMerchantRoutes } from '../items/merchant-routes.ts';
import { registerCraftingRoutes } from '../items/crafting-routes.ts';
import { registerWorldMapRoutes } from '../travel/world-map-routes.ts';
import { registerStatBlockRoutes } from '../editors/stat-block-routes.ts';
import { registerObjectRoutes } from '../editors/object-routes.ts';
import { registerRulesReferenceRoutes } from '../rules/reference-routes.ts';
import { registerAdvancementRoutes } from '../characters/advancement-routes.ts';
import { registerCopyRoutes } from '../characters/copy-routes.ts';
import { registerFeatureRoutes } from '../characters/feature-routes.ts';
import { registerCharacterCreationRoutes } from '../characters/creation-routes.ts';
import { registerEncounterRoutes } from './routes/encounter-routes.ts';
import { registerKnowledgeRoutes } from './routes/knowledge-routes.ts';
import { registerMemoryRoutes } from './routes/memory-routes.ts';
import { registerNpcRoutes } from './routes/npc-routes.ts';
import { registerQuestRoutes } from './routes/quest-routes.ts';
import { registerReadinessRoute } from './routes/readiness-routes.ts';
import { registerSessionRoutes } from './routes/session-routes.ts';
import { registerSurroundingsRoutes } from './routes/surroundings-routes.ts';
import { registerUndoneRoutes } from './routes/undone-routes.ts';
import { registerVisualRoutes } from './routes/visual-routes.ts';
import { SECURITY_HEADERS, registerOriginCheck } from './security.ts';

/**
 * The server's HTTP application (docs/adr/0009-http-api-and-dev-authentication.md).
 * Request IDs are generated server-side (client `x-request-id` is ignored),
 * responses are never cacheable, and errors never reveal internals.
 */
export interface AppDependencies {
  /** Independent workshop identity; its cookie never authenticates campaign requests. */
  readonly workshop?: WorkshopDependencies;
  readonly engine: WorldEngine;
  readonly authenticator: Authenticator;
  readonly logger: Logger;
  /** The AI gateway (docs/adr/0017-ai-gateway.md): DM intents, NPC replies, relevance; no write path. */
  readonly ai: RelevanceDeps & AiRouteDependencies['ai'];
  /** Authoring proposals (docs/adr/0018-ai-authoring.md); commits go through the World Engine. */
  readonly authoring: AuthoringDependencies;
  /** The DM's substitution reasons (docs/adr/0033-live-session.md §6); descriptive, not canonical. */
  readonly dm: DmDependencies;
  /** Generated asset contents (docs/adr/0022-asset-identity.md); the worker runs outside requests. */
  readonly assets: { readonly contents: AssetContentStore };
  /** Quest definitions (docs/adr/0025-ravenford-integration.md §2); the log is a projection. */
  readonly quests: readonly QuestDefinition[];
  /** Immutable per-campaign definitions for bootstrapped campaigns; legacy fallback stays above. */
  readonly campaignQuests?: CampaignQuestBooks;
  /**
   * Ravenford's quest books by language (Stage 605): a campaign seeded from Ravenford reads the one
   * in its language, so a campaign started from either template reads its own; `quests` otherwise.
   */
  readonly questsByLanguage?: Readonly<Partial<Record<Language, readonly QuestDefinition[]>>>;
  /** Every ready adventure but Ravenford: its quests and prepared encounters (ADR 0058 §5). */
  readonly adventures?: Readonly<Record<string, AdventureBooks>>;
  /** Each ready adventure's curated pictures, imported into a new campaign (ADR 0035 §3). */
  readonly adventurePictures?: AdventurePictures;
  /** Prepared encounters by language (Stage 605); none when absent. */
  readonly preparedEncounters?: PreparedEncounterBooks;
  /**
   * Live subscriptions (docs/adr/0033-live-session.md §5), shared by the application and its
   * silent fingerprint twin (`src/live/live-app.ts`). Without a live session nobody is present.
   */
  readonly presence?: PresenceSource;
  /**
   * Production sign-in (docs/adr/0036-production-sign-in.md), invitation mode only: the
   * `/auth/*` routes, the DM's members and invitations, the origin check, request limits.
   * Absent with development personas, which behave as before.
   */
  readonly signIn?: SignInDependencies;
  /**
   * `LTW_TRUST_PROXY`: the reverse proxy's addresses or ranges (Fastify `trustProxy`), so
   * `request.ip` is the client its `X-Forwarded-For` names; empty or absent trusts none.
   */
  readonly trustedProxies?: readonly string[];
  /**
   * Readiness of the stores (docs/adr/0037-deployment.md §3), served as `/readyz`. Compositions
   * without external stores (tests, in-memory journeys) are ready while the process runs.
   */
  readonly readiness?: ReadinessProbe;
  /** The table's rolls and the DM's check requests (Stage 510); in memory when absent. */
  readonly table?: TableDependencies;
  /** The table around a session (ADR 0043 §6): mode, pause, ready, absent; in memory when absent. */
  readonly lobby?: LobbyDependencies;
  /** Table talk (ADR 0044 §1): chat, whispers, the DM's word to one player; in memory when absent. */
  readonly chat?: ChatDependencies;
  /** The table's shared marks on the board (ADR 0057 §5); in memory when absent. */
  readonly marks?: MarkDependencies;
  /** Handouts (ADR 0044 §5): what the DM shows one player or the party; in memory when absent. */
  readonly handouts?: HandoutDependencies;
  /** The DM's music (docs/adr/0059-atmosphere.md §3); in memory when absent. */
  readonly music?: TrackStore;
  /**
   * The table's voice (docs/adr/0060-voice.md): its rooms, always this process's memory, and the
   * relay, when one is set (`LTW_TURN_URLS`, `LTW_TURN_SECRET`).
   */
  readonly voice?: { readonly rooms: VoiceRooms; readonly relay: VoiceRelay | null };
}

/** Table talk in memory: for compositions without a database. */
export const memoryMarks = (): MarkDependencies => ({
  store: new InMemoryMarkStore(),
  now: () => new Date().toISOString(),
});

export const memoryChat = (): ChatDependencies => ({
  store: new InMemoryChatStore(),
  now: () => new Date().toISOString(),
});

export const memoryHandouts = (): HandoutDependencies => ({
  store: new InMemoryHandoutStore(),
  now: () => new Date().toISOString(),
});

/** The table's rolls in memory, with the server's dice: for compositions without a database. */
export const memoryTable = (): TableDependencies => ({
  store: new InMemoryTableStore(),
  rests: new InMemoryRestStore(),
  dice: serverDice,
  now: () => new Date().toISOString(),
});

/** The request header that carries the credential: responses vary on it. */
export const credentialHeaderOf = (deps: Pick<AppDependencies, 'signIn'>) =>
  deps.signIn ? ('Cookie' as const) : ('Authorization' as const);

export function buildApp(input: AppDependencies): FastifyInstance {
  // Request limits apply in invitation mode (ADR 0036 §6); routes read them from their deps.
  const deps = input.signIn ? { ...input, limits: input.signIn.limits } : input;
  const vary = credentialHeaderOf(deps);
  // Typed as Fastify's base logger so routes share one instance type. Request lines carry the
  // method, URL and status only: never the client's address, a header or a cookie.
  const loggerInstance: FastifyBaseLogger = deps.logger.child({}, { serializers: LOG_SERIALIZERS });
  const proxies = deps.trustedProxies ?? [];
  const app = Fastify({
    loggerInstance,
    trustProxy: proxies.length > 0 ? [...proxies] : false,
    genReqId: () => randomUUID(),
    requestIdHeader: false,
    logController: new LogController({ requestIdLogLabel: 'requestId' }),
    bodyLimit: 64 * 1024,
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
    reply.header('cache-control', 'no-store');
    reply.header('vary', request.routeOptions.url?.startsWith('/workshop/') ? 'Cookie' : vary);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      // A route's own stricter policy (asset content) stays.
      if (!reply.hasHeader(name)) reply.header(name, value);
    }
  });
  if (deps.signIn) registerOriginCheck(app, deps.signIn.publicOrigin);

  app.setNotFoundHandler((request, reply) => sendError(reply, request, 'NOT_FOUND'));
  app.setErrorHandler((error, request, reply) => {
    const status = (error as { statusCode?: unknown }).statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      request.log.info({ code: (error as { code?: unknown }).code }, 'request rejected');
      return sendError(reply, request, status === 404 ? 'NOT_FOUND' : 'INVALID_REQUEST');
    }
    request.log.error({ err: error }, 'request failed');
    return sendError(reply, request, 'INTERNAL');
  });

  // Health checks poll every few seconds: their requests log only warnings and errors.
  app.get('/healthz', { logLevel: 'warn' }, (_request, reply) => reply.send({ status: 'ok' }));
  registerReadinessRoute(app, deps.readiness ?? processReadiness);
  registerKnowledgeRoutes(app, deps);
  registerSessionRoutes(app, deps);
  registerCharacterRoutes(app, deps);
  registerMemoryRoutes(app, deps);
  registerContextRoutes(app, deps);
  registerSurroundingsRoutes(app, deps);
  registerEncounterRoutes(app, deps);
  registerPreparedEncounterRoutes(app, deps);
  registerSavedEncounterRoutes(app, deps);
  registerBestiaryRoutes(app, deps);
  registerItemCatalogRoutes(app, deps);
  registerMerchantRoutes(app, deps);
  registerCraftingRoutes(app, deps);
  registerWorldMapRoutes(app, deps);
  registerStatBlockRoutes(app, deps);
  registerObjectRoutes(app, deps);
  registerRulesReferenceRoutes(app, deps);
  registerCharacterCreationRoutes(app, deps);
  // One lobby for the routes that read it: the pause holds players' commands.
  const lobby = deps.lobby ?? memoryLobby();
  registerCommandRoutes(app, { ...deps, lobby });
  registerAiRoutes(app, deps);
  registerNpcRoutes(app, deps);
  registerAuthoringRoutes(app, deps);
  registerAssetRoutes(app, deps);
  registerBattleMapUploadRoutes(app, deps);
  registerVisualRoutes(app, deps);
  registerChronicleRoutes(app, { ...deps, chronicleIds: deps.authoring.ids });
  registerQuestRoutes(app, deps);
  registerPresenceRoutes(app, { ...deps, presence: deps.presence ?? NOBODY_CONNECTED });
  // One set of tracks for the music's routes and the lobby that plays them (ADR 0059 §3).
  const music = deps.music ?? new InMemoryTrackStore();
  // One voice room a campaign, which the lobby ends when the table leaves online play (ADR 0060).
  const voice = deps.voice ?? { rooms: new VoiceRooms(), relay: null };
  registerLobbyRoutes(app, {
    ...deps,
    lobby,
    music,
    voice: voice.rooms,
    presence: deps.presence ?? NOBODY_CONNECTED,
  });
  registerMusicRoutes(app, { ...deps, lobby, music });
  registerVoiceRoutes(app, {
    ...deps,
    lobby,
    voice: voice.rooms,
    relay: voice.relay,
    credentialHeader: vary,
  });
  registerChatRoutes(app, { ...deps, chat: deps.chat ?? memoryChat() });
  registerMarkRoutes(app, { ...deps, marks: deps.marks ?? memoryMarks() });
  // One set of handouts for the handout routes and the DM's library that gives them (ADR 0058 §3).
  const handouts = deps.handouts ?? memoryHandouts();
  registerHandoutRoutes(app, { ...deps, handouts });
  registerDmRoutes(app, deps);
  registerUndoneRoutes(app, deps);
  // The roll and rest routes read the campaign's dice from the same table state (ADR 0044 §4).
  const table: TableDependencies = {
    ...(deps.table ?? memoryTable()),
    diceOf: async (campaignId) => (await lobby.state.read(campaignId)).dice,
  };
  registerRollRoutes(app, { ...deps, table });
  registerLibraryRoutes(app, { ...deps, handouts, table });
  registerRestRoutes(app, { ...deps, table });
  registerAdvancementRoutes(app, { ...deps, table });
  registerFeatureRoutes(app, deps);
  registerAttuneRoutes(app, { ...deps, table });
  if (deps.signIn) {
    const signIn = { ...deps, signIn: deps.signIn };
    registerAuthRoutes(app, signIn);
    registerMemberRoutes(app, signIn);
    const { accounts, accountLimits } = deps.signIn;
    // A character from another campaign of the same login (docs/FULL_GAME_PLAN.md decision 15).
    if (accounts) registerCopyRoutes(app, { ...deps, accounts });
    // Accounts (ADR 0041): the hub, signing in with a login, opening and creating campaigns.
    if (accounts && accountLimits) {
      registerAccountRoutes(app, { ...deps, signIn: { ...deps.signIn, accounts, accountLimits } });
    }
    // The table's displays and join links (ADR 0042): pairing, the cast, the table's QR code.
    const { displays, displayLimits, openLinks } = deps.signIn;
    if (displays && displayLimits && openLinks) {
      const display = { ...signIn, displays, displayLimits, openLinks };
      registerDisplayRoutes(app, display);
      registerTableLinkRoutes(app, display);
    }
  }
  if (deps.workshop) registerWorkshopRoutes(app, deps.workshop);
  return app;
}
