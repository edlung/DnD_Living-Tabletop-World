// Campaign play audit: drives one prepared package through the real activation worker,
// World Engine and HTTP routes. No provider, no database. Run from anywhere:
//   AUDIT_ROOT=<checkout> AUDIT_CAMPAIGNS=<dir> node --conditions=@ltw/source playthrough.ts <relative package path>...
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.env['AUDIT_ROOT'] ?? process.cwd();
const CAMPAIGNS = process.env['AUDIT_CAMPAIGNS'] ?? join(ROOT, 'campaigns');
const OUT = process.env['AUDIT_OUT'] ?? '/tmp/audit-out.jsonl';
const SEEDS = Number(process.env['AUDIT_SEEDS'] ?? 2);
const load = (p: string) => import(pathToFileURL(join(ROOT, p)).href);

const combat = await load('packages/combat/src/index.ts');
const domain = await load('packages/domain/src/index.ts');
const rules = await load('packages/rules/src/index.ts');
const { buildApp } = await load('apps/server/src/http/app.ts');
const { devPersonaAuthenticator } = await load('apps/server/src/http/auth.ts');
const { PublishedEventStore } = await load('apps/server/src/campaigns/published-event-store.ts');
const { createLogger } = await load('apps/server/src/platform/logging/logger.ts');
const af = await load('apps/server/src/testing/activation-fixture.ts');
const ra = await load('apps/server/src/testing/ravenford-app.ts');
const { loadCampaignActivationReview } = await load('apps/server/src/workshop/activation/review.ts');
const { CampaignActivationWorker } = await load('apps/server/src/workshop/activation/worker.ts');
const { createCampaignQuestBooks } = await load('apps/server/src/campaigns/quest-books.ts');
const hasBooks = existsSync(join(ROOT, 'apps/server/src/campaigns/encounter-books.ts'));
const books = hasBooks ? await load('apps/server/src/campaigns/encounter-books.ts') : null;

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Fx { app: any; engine: any; campaignId: string; dm: any; id: (k: string) => string; send: (p: string, b?: object, t?: string) => Promise<any>; seats: { key: string; token: string; id: string }[]; rng: () => number; }

// The memory fixture seeds a specimen draft; a campaign key equal to a specimen key of another kind
// is a harness collision (a real import goes to an empty draft), so the test copy renames it.
function dodgeCollisions(content: any, taken: Set<string>) {
  const hit = new Set<string>();
  const walk = (o: any) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (k === 'key' && typeof v === 'string' && taken.has(v)) hit.add(v); walk(v); } };
  walk(content.entities);
  if (!hit.size) return content;
  const map = (o: any): any => Array.isArray(o) ? o.map(map) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, map(v)])) : typeof o === 'string' && hit.has(o) ? `${o}-audit` : o;
  return map(content);
}

async function fixture(content0: any, seed: number): Promise<Fx> {
  const f = await af.activationMemoryFixture();
  const content = dodgeCollisions(content0, new Set(Object.keys(f.revision.identities.entities)));
  const saved = await f.revisions.append({ ...f.scope, requestId: randomUUID(), basedOnRevision: 1, content, source: { kind: 'OWNER', actorId: f.ownerId }, createdAt: new Date(f.now()).toISOString() });
  if (saved.kind !== 'saved') throw new Error('REVISION:' + saved.kind + ':' + JSON.stringify(saved).slice(0, 800));
  const reviewed = await loadCampaignActivationReview(f.deps, f.scope, { textOnly: true });
  if (!reviewed?.frozen) throw new Error('NO_REVIEW:' + JSON.stringify(reviewed?.review ?? null).slice(0, 800));
  const activation = await af.acceptedActivation(f.repository, { ...f.scope, authSessionId: f.authSessionId, request: af.activationRequest(reviewed.review), frozen: reviewed.frozen });
  const worker = new CampaignActivationWorker({ repository: f.repository, bootstrap: f.bootstrap, initialContent: f.content, contents: f.contents, draftImages: f.images });
  await worker.run({ ...f.scope, activationId: activation.activationId });
  await worker.shutdown();
  const campaignId = activation.campaignId;
  const rng = mulberry32(seed);
  const dice = { roll: (s: number) => 1 + Math.floor(rng() * s) };
  const engine = new domain.WorldEngine({ store: new PublishedEventStore(f.rawStore, f.publication), ids: new domain.SequentialIds(0x9900), clock: new domain.SteppingClock(), combat: combat.createCombatEngine(), checks: rules.skillCheckPort(dice), entropy: { next: () => Math.floor(rng() * 2 ** 32) } });
  const snap = await engine.load(campaignId);
  if (!snap?.state.campaign) throw new Error('NOT_PUBLISHED');
  const dm = { actorId: snap.state.campaign.dmActorId, kind: 'user' as const };
  const party = saved.revision.content.party as string[];
  const personas = [{ token: 'audit-dm-token', actorId: dm.actorId, description: 'dm' }, ...party.map((_, i) => ({ token: `audit-player-${i}`, actorId: `player-${i}`, description: `p${i}` })), { token: 'audit-outsider-token', actorId: 'outsider', description: 'o' }];
  const deps: any = { engine, authenticator: devPersonaAuthenticator({ personas }), logger: createLogger({ service: 'audit', level: 'silent' }), ai: ra.testAiGateway(), authoring: ra.testAuthoring(), dm: ra.testDm(), assets: { contents: f.contents }, quests: [], campaignQuests: createCampaignQuestBooks(f.content) };
  if (books) deps.campaignEncounters = books.createCampaignEncounterBooks(f.content);
  const app = buildApp(deps);
  const ids = saved.revision.identities.entities as Record<string, string>;
  const id = (k: string) => { const v = ids[k] ?? ids[`${k}-audit`]; if (!v) throw new Error('NO_ID:' + k); return v; };
  const seats = [] as Fx['seats'];
  for (const [i, key] of party.entries()) {
    const r = await engine.execute({ campaignId, commandId: `assign.${i}`, actor: dm, command: { type: 'AssignCharacter', characterId: id(key), playerActorId: `player-${i}` } });
    if (r.status === 'rejected') throw new Error('ASSIGN:' + JSON.stringify(r));
    seats.push({ key: key.replace(/-audit$/, ''), token: `audit-player-${i}`, id: id(key) });
  }
  await app.ready();
  const send = (path: string, body?: object, token = 'audit-dm-token') => app.inject({ method: body ? 'POST' : 'GET', url: `/campaigns/${campaignId}${path}`, headers: { authorization: `Bearer ${token}` }, ...(body ? { payload: body } : {}) });
  return { app, engine, campaignId, dm, id, send, seats, rng };
}

const cmd = (f: Fx, command: object, token: string, tag: string) => f.send('/commands', { commandId: `${tag}.${randomUUID().slice(0, 8)}`, command }, token);
const dmExec = (f: Fx, command: object, tag: string) => f.engine.execute({ campaignId: f.campaignId, commandId: `${tag}.${randomUUID().slice(0, 8)}`, actor: f.dm, command });
const ok = (r: any) => r.statusCode >= 200 && r.statusCode < 300;
const accepted = (r: any) => { if (!ok(r)) return false; try { const j = r.json(); return j.status !== 'rejected'; } catch { return true; } };

/** Exploration: every location, every clue, every NPC, the quest log. Uses player commands only. */
async function explore(content: any, res: any) {
  const f = await fixture(content, 7);
  try {
    const ents = content.entities as any[];
    const locs = ents.filter((e) => e.kind === 'location');
    const npcs = ents.filter((e) => e.kind === 'npc');
    const feats = ents.filter((e) => e.kind === 'feature');
    const lead = f.seats[0]!;
    const per = 'PLAYER';
    const parentOf = new Map<string, string | null>(locs.map((l) => [l.key, l.location?.parent ?? null]));
    let here: string = ents.find((e) => e.key === lead.key)?.placement?.location;
    const chain = (k: string) => { const c = [k]; let p = parentOf.get(k) ?? null; while (p) { c.unshift(p); p = parentOf.get(p) ?? null; } return c; };
    const walkFail: string[] = [];
    const enter = async (k: string) => {
      const r = await cmd(f, { type: 'EnterLocation', characterId: lead.id, locationId: f.id(k) }, lead.token, 'walk');
      if (accepted(r) || r.body.includes('NO_EFFECT')) { here = k; return true; }
      walkFail.push(`${here}->${k}:` + r.body.slice(0, 120)); return false;
    };
    const walk = async (target: string) => {
      if (here === target) return true;
      const tc = chain(target);
      // up to a common ancestor, then down, one perceived step at a time (a player's own moves)
      while (!tc.includes(here)) { const p = parentOf.get(here); if (!p) return false; if (!(await enter(p))) return false; }
      for (let i = tc.indexOf(here) + 1; i < tc.length; i++) if (!(await enter(tc[i]!))) return false;
      return true;
    };
    // seat views
    res.seatSheets = 0; res.seatInventory = 0; res.inventoryItems = 0;
    for (const s of f.seats) {
      if (ok(await f.send(`/entities/${s.id}/sheet?perspective=${per}`, undefined, s.token))) res.seatSheets++;
      const inv = await f.send(`/entities/${s.id}/inventory?perspective=${per}`, undefined, s.token);
      if (ok(inv)) { res.seatInventory++; const j = inv.json(); res.inventoryItems += (j.items ?? j.carried ?? j.entries ?? []).length; }
      else res.inventoryError = inv.statusCode + ':' + inv.body.slice(0, 200);
    }
    // what a player sees at the start
    const start = await f.send(`/surroundings?perspective=CHARACTER:${lead.id}`, undefined, lead.token);
    res.startSurroundings = start.statusCode;
    if (ok(start)) { const j = start.json(); res.startVisible = (j.entities ?? j.visible ?? []).length; res.startKeys = Object.keys(j).slice(0, 12); }
    else res.startSurroundingsBody = start.body.slice(0, 300);
    // locations reachable by a player's own command
    res.locationsEntered = 0; res.locationsFailed = [];
    for (const l of locs) {
      if (await walk(l.key)) res.locationsEntered++;
      else res.locationsFailed.push(l.key);
    }
    // clues
    res.cluesFound = 0; res.cluesFailed = [];
    const featAt = new Map(feats.map((e) => [e.key, e.placement?.location]));
    const knowledge = async () => (await f.send(`/knowledge?perspective=${per}`, undefined, lead.token)).body as string;
    for (const c of content.clues as any[]) {
      const at = featAt.get(c.entity);
      if (at) await walk(at);
      const r = await cmd(f, { type: 'ExamineEntity', characterId: lead.id, entityId: f.id(c.entity), method: c.method === 'inspect' ? 'inspect' : c.method }, lead.token, 'ex');
      const k = await knowledge();
      if (accepted(r) && k.includes(c.statement.slice(0, 60))) res.cluesFound++;
      else res.cluesFailed.push(c.key + ':' + r.body.slice(0, 200));
    }
    // NPCs: talk, ask each offered topic
    res.npcTalks = 0; res.npcTalkFailed = []; res.npcAskAccepted = 0; res.npcAskOffered = 0; res.npcNoTopics = []; res.talkStatus = {};
    for (const n of npcs) {
      const at = n.placement?.location;
      if (!at) { res.npcTalkFailed.push(n.key + ':NOT_PLACED'); continue; }
      await walk(at);
      const t = await f.send(`/npcs/${f.id(n.key)}/dialogue`, { characterId: lead.id, intent: { kind: 'talk' } }, lead.token);
      if (ok(t) && t.json().reply) { res.npcTalks++; const st = t.json().reply.status; res.talkStatus[st] = (res.talkStatus[st] ?? 0) + 1; }
      else res.npcTalkFailed.push(n.key + ':' + t.statusCode + ':' + t.body.slice(0, 160));
      const ctx = await f.send(`/entities/${f.id(n.key)}/context?perspective=CHARACTER:${lead.id}`, undefined, lead.token);
      if (!ok(ctx)) { res.npcContextFail = ctx.statusCode + ':' + ctx.body.slice(0, 200); continue; }
      const j = ctx.json();
      const actions = (j.context?.actions ?? j.actions ?? []) as any[];
      const topics = actions.filter((a) => a.topic || /ask/i.test(a.id ?? a.action ?? ''));
      if (!res.sampleActions) res.sampleActions = actions.slice(0, 8).map((a) => ({ id: a.id ?? a.action, legal: a.legal ?? a.verdict, topic: a.topic?.name ?? a.topic?.entityId ?? null }));
      if (!topics.filter((a) => a.topic).length) res.npcNoTopics.push(n.key);
      for (const a of topics.filter((x) => x.topic && (x.legal ?? x.available ?? true))) {
        res.npcAskOffered++;
        const r = await f.send(`/npcs/${f.id(n.key)}/dialogue`, { characterId: lead.id, intent: { kind: 'ask', topicId: a.topic.entityId } }, lead.token);
        if (ok(r) && r.json().reply) res.npcAskAccepted++;
      }
    }
    // quests
    const quests = async () => { const q = await f.send(`/quests?perspective=${per}`, undefined, lead.token); return ok(q) ? (q.json().quests as any[]) : (res.questError = q.statusCode + ':' + q.body.slice(0, 200), []); };
    const q1 = await quests();
    res.questsDefined = (content.quests as any[]).length;
    res.questsActiveAfterExploring = q1.length;
    res.questsCompletedAfterExploring = q1.filter((x) => x.status === 'completed').length;
    // Drive remaining milestones where a generic legal path exists
    const kn = await f.send(`/knowledge?perspective=${per}`, undefined, lead.token);
    const records = ok(kn) ? (kn.json().knowledge as any[]) : [];
    for (const q of content.quests as any[]) for (const m of q.milestones as any[]) {
      if (m.kind === 'reached' || m.kind === 'returned-to') {
        const other = locs.find((l) => l.key !== m.locationId && l.location?.parent);
        if (other) await walk(other.key);
        await walk(m.locationId);
      } else if (m.kind === 'examined-at') {
        await walk(m.locationId);
        const fe = feats.find((e) => e.placement?.location === m.locationId);
        if (fe) await cmd(f, { type: 'ExamineEntity', characterId: lead.id, entityId: f.id(fe.key), method: 'inspect' }, lead.token, 'q');
        else res.questNoFeature = (res.questNoFeature ?? []).concat(q.questId);
      } else if (m.kind === 'shown-to') {
        const npc = ents.find((e) => e.key === m.npcId);
        await walk(npc.placement.location);
        const rec = records.find((x) => x.knowledgeType === 'EVIDENCE' && (x.subjects ?? []).some((s: any) => (s.entityId ?? s) === f.id(m.subject))) ?? records.find((x) => (x.scope?.kind ?? x.scope) !== 'PUBLIC' && (x.subjects ?? []).some((s: any) => (s.entityId ?? s) === f.id(m.subject))) ?? records.find((x) => (x.subjects ?? []).some((s: any) => (s.entityId ?? s) === f.id(m.subject)));
        if (rec) { const sr = await cmd(f, { type: 'ShowEvidence', characterId: lead.id, npcId: f.id(m.npcId), knowledgeId: rec.knowledgeId }, lead.token, 'q'); (res.showResults ??= []).push(`${q.questId}:${m.stage}:${sr.statusCode}:${sr.body.slice(0, 100)}`); (res.showRec ??= []).push(JSON.stringify(rec).slice(0, 300)); }
        else res.questNoEvidence = (res.questNoEvidence ?? []).concat(q.questId + ':' + m.stage);
      } else res.questUnhandled = (res.questUnhandled ?? []).concat(q.questId + ':' + m.kind);
    }
    const q2 = await quests();
    res.questsActive = q2.length;
    res.questsCompleted = q2.filter((x) => x.status === 'completed').length;
    res.questTitles = q2.map((x) => `${x.title} [${x.status}]`);
    res.walkFail = walkFail.slice(0, 6);
  } finally { await f.app.close(); }
}

/** One fight, played to its end through real commands with seeded dice. */
async function fight(content: any, index: number, seed: number) {
  const f = await fixture(content, seed);
  const out: any = { index, seed, title: content.encounters[index].title, size: content.party.length };
  try {
    const enc = content.encounters[index];
    const ents = content.entities as any[];
    const parentOf = new Map<string, string | null>(ents.filter((e) => e.kind === 'location').map((l) => [l.key, l.location?.parent ?? null]));
    const chain = (k: string) => { const c = [k]; let p = parentOf.get(k) ?? null; while (p) { c.unshift(p); p = parentOf.get(p) ?? null; } return c; };
    for (const s of f.seats) {
      let here: string = ents.find((e) => e.key === s.key)?.placement?.location;
      const tc = chain(enc.location);
      const step = async (k: string) => { const r = await cmd(f, { type: 'EnterLocation', characterId: s.id, locationId: f.id(k) }, s.token, 'go'); if (!accepted(r) && !r.body.includes('NO_EFFECT')) out.enterFail = `${here}->${k}:` + r.body.slice(0, 200); here = k; };
      while (!tc.includes(here)) { const p = parentOf.get(here); if (!p) break; await step(p); }
      for (let i = tc.indexOf(here) + 1; i < tc.length; i++) await step(tc[i]!);
    }
    if (hasBooks) {
      const list = await f.send('/encounters/prepared');
      if (!ok(list)) { out.error = 'LIST:' + list.body.slice(0, 200); return out; }
      const started = await f.send(`/encounters/prepared/scenario-${index + 1}/start`, { requestId: randomUUID() });
      if (!ok(started)) { out.error = 'START:' + started.statusCode + ':' + started.body.slice(0, 300); return out; }
    } else {
      const start = await dmExec(f, { type: 'StartCombat', locationId: f.id(enc.location), battlefield: enc.battlefield, combatants: enc.combatants.map((c: any) => ({ entityId: f.id(c.entity), side: c.side, position: c.position })) }, 'start');
      if (start.status === 'rejected') { out.error = 'START:' + JSON.stringify(start).slice(0, 300); return out; }
    }
    const weaponsOf = new Map<string, string[]>();
    for (const c of content.entities as any[]) if (c.kind === 'character') weaponsOf.set(f.id(c.key), c.sheet.weapons);
    const load = async () => (await f.engine.load(f.campaignId)).state;
    let state = await load();
    if (!state.encounter) { out.error = 'NO_ENCOUNTER'; return out; }
    out.combatants = state.encounter.combatants.length;
    const partyIds = new Set(state.encounter.combatants.filter((c: any) => c.side === 'party').map((c: any) => c.entityId));
    const hpOf = (s: any, id: string): number => { const v = combat.vitalsOf(s, id); return (v?.hitPoints?.current ?? v?.currentHp ?? v?.hp ?? combat.hitPoints?.(v)?.current ?? 0) as number; };
    const startHp = new Map([...partyIds].map((id) => [id, hpOf(state, id)]));
    let steps = 0; let attacks = 0; let hits = 0; let rejected = 0;
    while (steps++ < 3000) {
      state = await load();
      const e = state.encounter;
      if (!e) break;
      const open = domain.openReactionWindow?.(state);
      if (open) { await dmExec(f, { type: 'CloseReactionWindow', windowId: open.windowId }, 'close'); continue; }
      const alive = (c: any) => combat.isAlive(state, c.entityId);
      const foes = e.combatants.filter((c: any) => c.side !== 'party' && alive(c));
      const heroes = e.combatants.filter((c: any) => c.side === 'party');
      const up = heroes.filter((c: any) => hpOf(state, c.entityId) > 0);
      if (!foes.length || !up.length) break;
      const cur = e.combatants[e.currentIndex];
      if (!cur) { rejected++; break; }
      if (cur.side === 'party') {
        const seat = f.seats.find((s) => s.id === cur.entityId);
        let done = false;
        const dist = (a: any, b: any) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
        const sorted = [...foes].sort((a, b) => dist(cur.position, a.position) - dist(cur.position, b.position));
        for (const w of weaponsOf.get(cur.entityId) ?? []) {
          for (const t of sorted) {
            const p = combat.attackPlan(state, e, cur.entityId, w, t.entityId);
            if (p.legal) {
              const r = await cmd(f, { type: 'Attack', combatantId: cur.entityId, attackId: w, targetId: t.entityId }, seat!.token, 'atk');
              attacks++; if (r.body.includes('"hit":true') || r.body.includes('AttackHit')) hits++;
              if (!accepted(r)) { rejected++; out.lastReject = r.body.slice(0, 240); }
              else done = true;
              break;
            }
          }
          if (done) break;
        }
        if (done) continue;
        // move toward nearest foe with BFS
        const target = sorted[0];
        const occupied = new Set(e.combatants.filter(alive).map((c: any) => `${c.position.x},${c.position.y}`));
        const W = e.battlefield.width, H = e.battlefield.height;
        const prev = new Map<string, string | null>(); const startK = `${cur.position.x},${cur.position.y}`; prev.set(startK, null);
        const q = [cur.position]; let goal: any = null;
        while (q.length && !goal) {
          const s = q.shift();
          for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
            if (!dx && !dy) continue; const n = { x: s.x + dx, y: s.y + dy };
            if (n.x < 0 || n.y < 0 || n.x >= W || n.y >= H) continue; const k = `${n.x},${n.y}`;
            if (prev.has(k) || occupied.has(k)) continue; prev.set(k, `${s.x},${s.y}`); q.push(n);
            if (dist(n, target.position) === 1) { goal = n; break; }
          }
          if (goal) break;
        }
        let moved = false;
        if (goal && dist(cur.position, target.position) > 1) {
          const path: any[] = []; let k: string | null = `${goal.x},${goal.y}`;
          while (k && k !== startK) { const [x, y] = k.split(',').map(Number); path.unshift({ x, y }); k = prev.get(k) ?? null; }
          for (let n = path.length; n >= 1 && !moved; n--) {
            const p = path.slice(0, n);
            const plan = combat.movePlan(state, e, cur, p);
            if (plan.legal) { const r = await cmd(f, { type: 'MoveCombatant', combatantId: cur.entityId, path: p }, seat!.token, 'mv'); if (accepted(r)) moved = true; else { rejected++; out.lastReject = r.body.slice(0, 240); } }
          }
        }
        if (moved) continue;
        const r = await cmd(f, { type: 'EndTurn', combatantId: cur.entityId }, seat!.token, 'end');
        if (!accepted(r)) { rejected++; out.lastReject = r.body.slice(0, 240); await dmExec(f, { type: 'EndTurn', combatantId: cur.entityId }, 'dmend'); }
      } else {
        const sug = combat.suggestMonsterTurn(state);
        if (!sug) { const r = await dmExec(f, { type: 'EndTurn', combatantId: cur.entityId }, 'mend'); if (r.status === 'rejected') rejected++; continue; }
        const r = await dmExec(f, sug.command, 'm');
        if (r.status === 'rejected') { rejected++; out.lastReject = JSON.stringify(r).slice(0, 240); await dmExec(f, { type: 'EndTurn', combatantId: cur.entityId }, 'mend'); }
      }
    }
    state = await load();
    const e = state.encounter;
    out.steps = steps; out.attacks = attacks; out.rejected = rejected; out.stuck = steps >= 3000;
    if (e) {
      out.rounds = e.round;
      const left = e.combatants.filter((c: any) => c.side !== 'party' && combat.isAlive(state, c.entityId)).length;
      const heroes = e.combatants.filter((c: any) => c.side === 'party');
      const up = heroes.filter((c: any) => hpOf(state, c.entityId) > 0);
      out.foesLeft = left; out.heroesUp = up.length; out.heroes = heroes.length;
      out.foeHpLeft = e.combatants.filter((c: any) => c.side !== 'party').map((c: any) => hpOf(state, c.entityId));
      const remaining = heroes.reduce((a: number, c: any) => a + hpOf(state, c.entityId), 0);
      const total = heroes.reduce((a: number, c: any) => a + (startHp.get(c.entityId) ?? 0), 0);
      out.partyHpLeftPct = Math.round((remaining / total) * 100);
      out.victory = left === 0 && up.length > 0;
      const end = await dmExec(f, { type: 'EndCombat', encounterId: e.encounterId }, 'endc');
      out.endCombat = end.status;
      if (end.status === 'rejected') out.endReject = JSON.stringify(end).slice(0, 240);
    } else out.error = 'ENCOUNTER_GONE';
    return out;
  } catch (err: any) { out.error = 'THROW:' + String(err?.stack ?? err).slice(0, 500); return out; }
  finally { await f.app.close(); }
}

const targets = process.argv.slice(2);
mkdirSync(dirname(OUT), { recursive: true });
for (const rel of targets) {
  const t0 = Date.now();
  const res: any = { package: rel };
  try {
    const content = JSON.parse(readFileSync(join(CAMPAIGNS, rel), 'utf8'));
    res.party = content.party.length;
    try { await explore(content, res); res.exploreOk = true; } catch (err: any) { res.exploreOk = false; res.exploreError = String(err?.message ?? err).slice(0, 900); }
    if (!process.env['AUDIT_NO_FIGHTS']) {
      res.fights = [];
      for (let i = 0; i < content.encounters.length; i++) for (let s = 1; s <= SEEDS; s++) {
        res.fights.push(await fight(content, i, 1000 * (i + 1) + s));
      }
    }
  } catch (err: any) { res.fatal = String(err?.stack ?? err).slice(0, 900); }
  res.ms = Date.now() - t0;
  appendFileSync(OUT, JSON.stringify(res) + '\n');
  console.log(rel, res.ms + 'ms', res.exploreOk, res.fatal ?? '');
}
process.exit(0);
