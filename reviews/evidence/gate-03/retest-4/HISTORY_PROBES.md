# Genuine writers, schema compatibility and protected undo

24 PostgreSQL cases: six scenarios written by each of 88d8137, b38cbbc, e893497 and current 998887d. Archives the three older revisions into temporary directories and installs their frozen dependencies from the offline pnpm cache. Actual authenticated commands produce each stream; stored events are never rewritten. Compares every original command-boundary state, exercises current reads/continuation/version guards, rejects unsafe target-creation/status/placement/caster-placement/healing undo, checks the original writer’s rules before and after rejection, and recovers by explicit reverse undo with reload. Requires Git history, the offline dependency cache and PostgreSQL. Removes every owned database and temporary archive.

Run from the repository root with Node 24+ and installed workspace dependencies:

````sh
sed -n '/^```javascript$/,/^```$/p' reviews/evidence/gate-03/retest-4/HISTORY_PROBES.md | sed '1d;$d' | node --conditions=@ltw/source --input-type=module
````

```javascript
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { createThrowawayDatabase } from './apps/server/src/testing/throwaway-database.ts';
import { PostgresEventStore } from './apps/server/src/world-engine/postgres-event-store.ts';
import { ravenfordApp, TOKENS } from './apps/server/src/testing/ravenford-app.ts';
import {
  WorldEngine,
  SequentialIds,
  SteppingClock,
  replay,
  redecideEffective,
  checkWorldIntegrity,
  parseRecordedEvent,
  undoneBeneathEarlierWriters,
} from './packages/domain/src/index.ts';
import {
  assertWritable,
  writtenEarlier,
  schemaVersionOf,
} from './packages/domain/src/kernel/event-versions.ts';
import { createCombatEngine } from './packages/combat/src/engine.ts';
import { reactionWindowViolations } from './packages/combat/src/reactions/invariants.ts';
import { ScriptedEntropy } from './packages/combat/src/testing/road.ts';
const require = createRequire(new URL('./apps/server/package.json', `file://${process.cwd()}/`));
const { Pool } = require('pg');
const worker =
  "import assert from 'node:assert/strict';\nimport {createRequire} from 'node:module';\nimport {createHash} from 'node:crypto';\nimport {ravenfordApp,seededEngine,TOKENS} from './apps/server/src/testing/ravenford-app.ts';\nimport {PostgresEventStore} from './apps/server/src/world-engine/postgres-event-store.ts';\nimport {SequentialIds,SteppingClock,WorldEngine,replay} from './packages/domain/src/index.ts';\nimport {createCombatEngine} from './packages/combat/src/engine.ts';\nimport {ScriptedEntropy} from './packages/combat/src/testing/road.ts';\nimport ambush from './fixtures/ravenford/road-ambush.json' with {type:'json'};\nconst require=createRequire(new URL('./apps/server/package.json',`file://${process.cwd()}/`));\nconst {Pool}=require('pg'); const pool=new Pool({connectionString:process.env.LTW_G03_DATABASE_URL});let app;\nconst digest=state=>createHash('sha256').update(JSON.stringify(state,(_k,v)=>v instanceof Map?{map:[...v]}:v instanceof Set?{set:[...v]}:v)).digest('hex');\ntry{\n const store=new PostgresEventStore(pool);const entropy=new ScriptedEntropy();let engine=await seededEngine(store,undefined,entropy);app=await ravenfordApp(engine);let serial=0;\n const post=async(command,token=TOKENS.dm)=>{const r=await app.inject({method:'POST',url:'/campaigns/ravenford/commands',headers:{authorization:`Bearer ${token}`},payload:{commandId:`r4-legacy-${++serial}`,command}});assert.equal(r.statusCode,200,r.body);const b=r.json();assert.equal(b.status,'accepted');return b;};\n const mode=process.env.LTW_G03_MODE;const labels={};\n if(mode==='baseline'){\n  labels.entity=(await post({type:'CreateEntity',entityId:'legacy-far-charm',kind:'item',name:'Far Charm',existsSince:null,placement:{locationId:'north-gate',since:null}})).commandId;\n  labels.clue=(await post({type:'AddClue',entityId:'legacy-far-charm',clueId:'legacy-far-magic',method:'magic',statement:'Far magic',subjects:[]})).commandId;\n  labels.cast=(await post({type:'CastSpell',combatantId:'elowen-starwhisper',spellId:'detect-magic'},TOKENS.player)).commandId;\n  labels.repeat=(await post({type:'CastSpell',combatantId:'elowen-starwhisper',spellId:'detect-magic'},TOKENS.player)).commandId;\n  labels.undoRepeat=(await post({type:'UndoCommand',targetCommandId:labels.repeat})).commandId;\n }else{\n  for(const c of ambush.place)await post(c);entropy.queue(20,[3,2,1,15]);\n  await post({...ambush.startCombat,combatants:ambush.startCombat.combatants.filter(c=>c.entityId!=='elowen-starwhisper')});\n  labels.entity=(await post({type:'CreateEntity',entityId:'legacy-bystander',kind:'npc',name:'Bystander',existsSince:null,...(mode==='placement'?{}:{placement:{locationId:mode==='caster-placement'?'golden-stag-inn':'old-trade-road',since:null}})})).commandId;\n  labels.premise=labels.entity;\n  if(mode==='healing-status'){const block=(await engine.load('ravenford')).state.statBlocks.get('goblin-shaman');await post({type:'SetStatBlock',entityId:'legacy-bystander',statBlock:{...block,hitPoints:{...block.hitPoints,current:1}}});}\n  if(mode==='status'||mode==='healing-status'){\n   await post({type:'ChangeEntityStatus',entityId:'legacy-bystander',status:'dead'});\n   labels.premise=(await post({type:'ChangeEntityStatus',entityId:'legacy-bystander',status:'active'})).commandId;\n  }\n  if(mode==='placement')labels.premise=(await post({type:'PlaceEntity',entityId:'legacy-bystander',locationId:'old-trade-road'})).commandId;\n  if(mode==='caster-placement')labels.premise=(await post({type:'EnterLocation',characterId:'elowen-starwhisper',locationId:'golden-stag-inn'},TOKENS.player)).commandId;\n  labels.cast=(await post({type:'CastSpell',combatantId:'elowen-starwhisper',spellId:mode==='healing-status'?'healing-word':'hunters-mark',targetId:'legacy-bystander'},TOKENS.player)).commandId;\n }\n await app.close();engine=new WorldEngine({store,ids:new SequentialIds(91),clock:new SteppingClock(),combat:createCombatEngine(),entropy});app=await ravenfordApp(engine);\n const snapshot=await engine.load('ravenford');const log=await engine.commandLog('ravenford');\n const response=await app.inject({method:'GET',url:'/campaigns/ravenford/encounter?perspective=PLAYER',headers:{authorization:`Bearer ${TOKENS.player}`}});assert.equal(response.statusCode,200);\n console.log(JSON.stringify({mode,labels,version:snapshot.state.version,httpStatus:response.statusCode,prefixes:log.map(c=>({sequence:c.lastSequence,digest:digest(replay(snapshot.history,{untilSequence:c.lastSequence}))})),premiseEvent:snapshot.history.find(e=>e.type==='PremisesRecorded'&&e.causation.commandId===labels.cast)}));\n}finally{if(app)await app.close();await pool.end();}\n";
const oldAudit =
  "import {createRequire} from 'node:module';\nimport {PostgresEventStore} from './apps/server/src/world-engine/postgres-event-store.ts';\nimport {WorldEngine,SequentialIds,SteppingClock,redecideEffective} from './packages/domain/src/index.ts';\nimport {createCombatEngine} from './packages/combat/src/engine.ts';\nconst require=createRequire(new URL('./apps/server/package.json',`file://${process.cwd()}/`));const{Pool}=require('pg');\nconst pool=new Pool({connectionString:process.env.LTW_G03_DATABASE_URL});\ntry{const engine=new WorldEngine({store:new PostgresEventStore(pool),ids:new SequentialIds(98),clock:new SteppingClock(),combat:createCombatEngine()});const snap=await engine.load('ravenford');console.log(JSON.stringify({redecision:redecideEffective(await engine.commandLog('ravenford'),snap,()=>0,createCombatEngine())}));}finally{await pool.end();}\n";
const revisions = [
  '88d8137401451dd6a6d6703217bf53e273a2ede4',
  'b38cbbcb6dcf340a5ab207a3fb2f4a8dac9f2750',
  'e893497fef95e53ec54f4baa0a314a341d09515b',
  '998887d7c5ecd7ce28b3c01c13a37ee07dbf62f1',
];
const results = {};
const snapshots = [];
const digest = (state) =>
  createHash('sha256')
    .update(
      JSON.stringify(state, (_k, v) =>
        v instanceof Map ? { map: [...v] } : v instanceof Set ? { set: [...v] } : v,
      ),
    )
    .digest('hex');
try {
  for (const revision of revisions) {
    let cwd = process.cwd();
    if (revision !== revisions[revisions.length - 1]) {
      cwd = await mkdtemp(join(tmpdir(), 'ltw-g03-r4-legacy-'));
      snapshots.push(cwd);
      const archive = execFileSync('git', ['archive', '--format=tar', revision], {
        maxBuffer: 32 * 1024 * 1024,
      });
      execFileSync('tar', ['-x', '-C', cwd], { input: archive });
      execFileSync('pnpm', ['install', '--offline', '--frozen-lockfile', '--ignore-scripts'], {
        cwd,
        stdio: 'pipe',
      });
    }
    for (const mode of [
      'baseline',
      'existence',
      'status',
      'placement',
      'caster-placement',
      'healing-status',
    ]) {
      const db = await createThrowawayDatabase({ migrate: true });
      const pool = new Pool({ connectionString: db.url });
      let app;
      const runOld = (script) => {
        const r = spawnSync(process.execPath, ['--conditions=@ltw/source', '--input-type=module'], {
          cwd,
          env: { ...process.env, LTW_G03_DATABASE_URL: db.url, LTW_G03_MODE: mode },
          input: script,
          encoding: 'utf8',
          maxBuffer: 4 * 1024 * 1024,
        });
        assert.equal(r.status, 0, r.stderr);
        return JSON.parse(r.stdout);
      };
      try {
        const original = runOld(worker);
        const store = new PostgresEventStore(pool);
        let namespace = 100,
          serial = 0;
        let engine;
        const restart = async () => {
          if (app) await app.close();
          engine = new WorldEngine({
            store,
            ids: new SequentialIds(++namespace),
            clock: new SteppingClock(),
            combat: createCombatEngine(),
            entropy: new ScriptedEntropy(),
          });
          app = await ravenfordApp(engine);
        };
        await restart();
        const post = async (command, token = TOKENS.dm) => {
          const r = await app.inject({
            method: 'POST',
            url: '/campaigns/ravenford/commands',
            headers: { authorization: `Bearer ${token}` },
            payload: { commandId: `r4-current-${++serial}`, command },
          });
          const body = r.json();
          delete body.requestId;
          return { http: r.statusCode, body };
        };
        const ok = (r) => {
          assert.equal(r.http, 200, JSON.stringify(r));
          assert.equal(r.body.status, 'accepted', JSON.stringify(r));
          return r;
        };
        const undo = (id) => post({ type: 'UndoCommand', targetCommandId: id });
        const snapshot = () => engine.load('ravenford');
        const snap = await snapshot();
        assert.equal(snap.state.version, original.version);
        for (const p of original.prefixes)
          assert.equal(
            digest(replay(snap.history, { untilSequence: p.sequence })),
            p.digest,
            `prefix ${p.sequence}`,
          );
        const get = await app.inject({
          method: 'GET',
          url: '/campaigns/ravenford/encounter?perspective=PLAYER',
          headers: { authorization: `Bearer ${TOKENS.player}` },
        });
        assert.equal(get.statusCode, 200);
        const audit = async () => {
          const s = await snapshot();
          assert.deepEqual(replay(s.history), s.state);
          assert.deepEqual(checkWorldIntegrity(s.state), []);
          assert.deepEqual(undoneBeneathEarlierWriters(s.state, s.history), []);
          assert.deepEqual(reactionWindowViolations(s.state), []);
          const r = redecideEffective(
            await engine.commandLog('ravenford'),
            s,
            () => 0,
            createCombatEngine(),
          );
          assert.equal(r, null, JSON.stringify(r));
          return {
            replayEqual: true,
            structuralViolations: [],
            windowViolations: [],
            currentOracle: r,
          };
        };
        const base = {
          writerRevision: revision,
          mode,
          labels: original.labels,
          oldVersion: original.version,
          oldPremiseEvent: original.premiseEvent,
          prefixesCompared: original.prefixes.length,
          prefixStatesEqual: true,
          httpGet: 200,
        };
        if (mode === 'baseline') {
          const originalClueUndo = await undo(original.labels.clue);
          assert.equal(originalClueUndo.body.code, 'UNDO_UNSAFE');
          assert.ok(
            originalClueUndo.body.details.blockers.some(
              (b) => b.commandId === original.labels.cast,
            ),
          );
          assert.deepEqual(await snapshot(), snap);
          const note = ok(
            await post({
              type: 'AddKnowledge',
              scope: { kind: 'DM' },
              knowledgeType: 'SECRET',
              statement: 'Current continuation',
              subjects: [],
              knownSince: null,
            }),
          );
          const cast = ok(
            await post(
              { type: 'CastSpell', combatantId: 'elowen-starwhisper', spellId: 'detect-magic' },
              TOKENS.player,
            ),
          );
          await restart();
          const now = await snapshot();
          const written = now.history.find(
            (e) => e.type === 'PremisesRecorded' && e.causation.commandId === cast.body.commandId,
          );
          assert.equal(written.schemaVersion, 3);
          assert.ok(!written.payload.premises.some((p) => p.kind === 'placement'));
          assert.throws(() => parseRecordedEvent({ ...written, schemaVersion: 4 }));
          assert.throws(() => parseRecordedEvent({ ...written, schemaVersion: 0 }));
          const legacy = {
            ...written,
            payload: {
              characterId: 'elowen-starwhisper',
              premises: [{ kind: 'placement', entityId: 'legacy-far-charm' }],
            },
          };
          assert.throws(() => parseRecordedEvent(legacy));
          assert.throws(() => assertWritable(legacy.type, legacy.payload));
          assert.equal(
            parseRecordedEvent({ ...legacy, schemaVersion: 1 }).payload.premises[0].kind,
            'placement',
          );
          const simple = now.history.find((e) => e.type === 'ClueAdded');
          assert.throws(() => parseRecordedEvent({ ...simple, schemaVersion: 3 }));
          const still = await undo(original.labels.clue);
          assert.equal(still.body.code, 'UNDO_UNSAFE');
          assert.ok(still.body.details.blockers.some((b) => b.commandId === cast.body.commandId));
          await audit();
          ok(await undo(cast.body.commandId));
          ok(await undo(note.body.commandId));
          ok(await undo(original.labels.cast));
          ok(await undo(original.labels.clue));
          ok(await undo(original.labels.entity));
          await restart();
          assert.equal((await snapshot()).state.entities.has('legacy-far-charm'), false);
          results[`H05-${revision.slice(0, 7)}`] = {
            ...base,
            oldUndo: originalClueUndo,
            newPremiseVersion: written.schemaVersion,
            versionGuards: true,
            reverseRecovery: true,
            ...(await audit()),
          };
        } else {
          // Old-writer decisions were legal before the CURRENT implementation's undo.
          const beforeOracle = runOld(oldAudit);
          assert.equal(beforeOracle.redecision, null);
          const attempted = await undo(original.labels.premise);
          assert.equal(attempted.http, 422);
          assert.equal(attempted.body.code, 'UNDO_UNSAFE');
          assert.ok(
            attempted.body.details.blockers.some((b) => b.commandId === original.labels.cast),
          );
          assert.deepEqual(await snapshot(), snap);
          await restart();
          const after = await snapshot();
          const target = after.state.entities.get('legacy-bystander');
          const caster = after.state.entities.get('elowen-starwhisper');
          const concentration = after.state.characterSheets.get('elowen-starwhisper').concentration;
          if (mode !== 'healing-status') assert.equal(concentration.targetId, 'legacy-bystander');
          assert.equal(after.state.commands.get(original.labels.cast).undoneBy, null);
          const sameRules = runOld(oldAudit);
          assert.equal(sameRules.redecision, null);
          const protectedAudit = await audit();
          ok(await undo(original.labels.cast));
          ok(await undo(original.labels.premise));
          await restart();
          const recovered = await snapshot();
          assert.ok(recovered.state.commands.get(original.labels.cast).undoneBy);
          assert.ok(recovered.state.commands.get(original.labels.premise).undoneBy);
          assert.ok(
            recovered.history
              .filter((e) => e.sequence > original.version)
              .every((e) => !writtenEarlier(e) && e.schemaVersion === schemaVersionOf(e.type)),
          );
          results[`H07-${revision.slice(0, 7)}-${mode}`] = {
            ...base,
            undoProtected: true,
            undo: attempted,
            targetStatus: target.status,
            targetPlacement: target.placement,
            casterPlacement: caster.placement,
            concentration,
            castStillEffectiveAfterRejection: true,
            oldRulesBeforeUndo: beforeOracle,
            oldRulesAfterRejection: sameRules,
            survivesReload: true,
            protectedAudit,
            reverseRecovery: true,
            ...(await audit()),
          };
        }
      } finally {
        if (app) await app.close();
        await pool.end();
        await db.drop();
      }
    }
  }
} finally {
  for (const directory of snapshots) await rm(directory, { recursive: true, force: true });
}
await mkdir('reviews/evidence/gate-03/retest-4', { recursive: true });
await writeFile(
  'reviews/evidence/gate-03/retest-4/history-results.json',
  JSON.stringify(results, null, 2) + '\n',
);
console.log(JSON.stringify({ cases: Object.keys(results).length, allAssertionsPassed: true }));
```
