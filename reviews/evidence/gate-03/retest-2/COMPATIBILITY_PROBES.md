# Historical event compatibility retest

Two PostgreSQL cases: a genuine stream written by revision 88d8137401451dd6a6d6703217bf53e273a2ede4, then a fresh-current control. The script archives that exact revision to a temporary directory and installs its locked dependencies from the offline pnpm cache. It creates and drops only its two owned throwaway databases and deletes its temporary snapshot. It does not rewrite events or reset development data. Requires Git history, PostgreSQL and the offline dependency cache. The H05 assertions deliberately confirm the upgrade failure.

Run from the repository root with Node 24+ and installed workspace dependencies:

````sh
sed -n '/^```javascript$/,/^```$/p' reviews/evidence/gate-03/retest-2/COMPATIBILITY_PROBES.md | sed '1d;$d' | node --conditions=@ltw/source --input-type=module
````

```javascript
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createThrowawayDatabase } from './apps/server/src/testing/throwaway-database.ts';
import { PostgresEventStore } from './apps/server/src/world-engine/postgres-event-store.ts';
import { ravenfordApp, TOKENS } from './apps/server/src/testing/ravenford-app.ts';
import {
  WorldEngine,
  SequentialIds,
  SteppingClock,
  parseRecordedEvent,
} from './packages/domain/src/index.ts';
import { createCombatEngine } from './packages/combat/src/engine.ts';
const LEGACY_REVISION = '88d8137401451dd6a6d6703217bf53e273a2ede4';
const require = createRequire(new URL('./apps/server/package.json', `file://${process.cwd()}/`));
const { Pool } = require('pg');
const results = {};
const legacyWorker =
  "import assert from 'node:assert/strict';\nimport {createRequire} from 'node:module';\nimport {ravenfordApp,seededEngine,TOKENS} from './apps/server/src/testing/ravenford-app.ts';\nimport {PostgresEventStore} from './apps/server/src/world-engine/postgres-event-store.ts';\nimport {SequentialIds,SteppingClock,WorldEngine,parseRecordedEvent} from './packages/domain/src/index.ts';\nimport {createCombatEngine} from './packages/combat/src/engine.ts';\nconst require=createRequire(new URL('./apps/server/package.json',`file://${process.cwd()}/`));\nconst {Pool}=require('pg');\nconst pool=new Pool({connectionString:process.env.LTW_G03_DATABASE_URL});\nlet app;\ntry {\n const store=new PostgresEventStore(pool); let engine=await seededEngine(store); app=await ravenfordApp(engine);\n let serial=0;\n const post=async(command,token=TOKENS.dm)=>{const response=await app.inject({method:'POST',url:'/campaigns/ravenford/commands',headers:{authorization:`Bearer ${token}`},payload:{commandId:`legacy-${++serial}`,command}});assert.equal(response.statusCode,200,response.body);const body=response.json();assert.equal(body.status,'accepted');return body;};\n await post({type:'CreateEntity',entityId:'legacy-far-charm',kind:'item',name:'Far Charm',existsSince:null,placement:{locationId:'north-gate',since:null}});\n await post({type:'AddClue',entityId:'legacy-far-charm',clueId:'legacy-far-magic',method:'magic',statement:'Far magic',subjects:[]});\n const cast=await post({type:'CastSpell',combatantId:'elowen-starwhisper',spellId:'detect-magic'},TOKENS.player);\n await app.close(); engine=new WorldEngine({store,ids:new SequentialIds(96),clock:new SteppingClock(),combat:createCombatEngine()}); app=await ravenfordApp(engine);\n const snapshot=await engine.load('ravenford'); const event=snapshot.history.find(e=>e.type==='PremisesRecorded'&&e.causation.commandId===cast.commandId);\n assert.ok(event.payload.premises.some(p=>p.kind===(process.env.LTW_G03_PREMISE_KIND??'placement'))); parseRecordedEvent(event);\n const response=await app.inject({method:'GET',url:'/campaigns/ravenford/encounter?perspective=PLAYER',headers:{authorization:`Bearer ${TOKENS.player}`}});\n assert.equal(response.statusCode,200,response.body);\n console.log(JSON.stringify({castCommand:cast.commandId,event,version:snapshot.state.version,reloaded:true,httpStatus:response.statusCode}));\n} finally {if(app)await app.close();await pool.end();}\n";
const snapshot = await mkdtemp(join(tmpdir(), 'ltw-g03-r2-legacy-'));
try {
  const archive = execFileSync('git', ['archive', '--format=tar', LEGACY_REVISION], {
    maxBuffer: 32 * 1024 * 1024,
  });
  execFileSync('tar', ['-x', '-C', snapshot], { input: archive });
  execFileSync('pnpm', ['install', '--offline', '--frozen-lockfile', '--ignore-scripts'], {
    cwd: snapshot,
    stdio: 'pipe',
  });
  for (const legacy of [true, false]) {
    const database = await createThrowawayDatabase({ migrate: true });
    const pool = new Pool({ connectionString: database.url });
    let app;
    try {
      const writer = spawnSync(
        process.execPath,
        ['--conditions=@ltw/source', '--input-type=module'],
        {
          cwd: legacy ? snapshot : process.cwd(),
          env: {
            ...process.env,
            LTW_G03_DATABASE_URL: database.url,
            LTW_G03_PREMISE_KIND: legacy ? 'placement' : 'unreached',
          },
          input: legacyWorker,
          encoding: 'utf8',
          maxBuffer: 1024 * 1024,
        },
      );
      assert.equal(writer.status, 0, writer.stderr);
      const previous = JSON.parse(writer.stdout);
      assert.equal(previous.httpStatus, 200);
      assert.equal(previous.reloaded, true);
      const store = new PostgresEventStore(pool);
      const engine = new WorldEngine({
        store,
        ids: new SequentialIds(97),
        clock: new SteppingClock(),
        combat: createCombatEngine(),
      });
      app = await ravenfordApp(engine);
      let parseError = null;
      try {
        parseRecordedEvent(previous.event);
      } catch (error) {
        parseError = { name: error.name, issues: error.issues };
      }
      let loadError = null;
      try {
        await engine.load('ravenford');
      } catch (error) {
        loadError = { name: error.name, issues: error.issues };
      }
      const get = await app.inject({
        method: 'GET',
        url: '/campaigns/ravenford/encounter?perspective=PLAYER',
        headers: { authorization: `Bearer ${TOKENS.player}` },
      });
      const post = await app.inject({
        method: 'POST',
        url: '/campaigns/ravenford/commands',
        headers: { authorization: `Bearer ${TOKENS.dm}` },
        payload: {
          commandId: 'after-upgrade',
          command: {
            type: 'AddKnowledge',
            scope: { kind: 'DM' },
            knowledgeType: 'SECRET',
            statement: 'Post-upgrade note',
            subjects: [],
            knownSince: null,
          },
        },
      });
      const getBody = get.json();
      delete getBody.requestId;
      const postBody = post.json();
      delete postBody.requestId;
      const head = await pool.query('SELECT version FROM ltw_event_streams WHERE stream_id = $1', [
        'ravenford',
      ]);
      const count = await pool.query(
        'SELECT count(*) AS count FROM ltw_events WHERE stream_id = $1',
        ['ravenford'],
      );
      const after = { version: Number(head.rows[0].version), events: Number(count.rows[0].count) };
      if (legacy) {
        assert.equal(parseError?.name, 'ZodError');
        assert.deepEqual(loadError, parseError);
        assert.equal(get.statusCode, 500);
        assert.equal(post.statusCode, 500);
        assert.deepEqual(after, { version: previous.version, events: previous.version });
      } else {
        assert.equal(parseError, null);
        assert.equal(loadError, null);
        assert.equal(get.statusCode, 200);
        assert.equal(post.statusCode, 200);
        assert.equal(postBody.status, 'accepted');
        assert.equal(after.version, previous.version + 1);
        assert.equal(after.events, after.version);
      }
      results[legacy ? 'H05-upgrade-from-retest-1' : 'H05-fresh-current-control'] = {
        writerRevision: legacy ? LEGACY_REVISION : 'b38cbbcb6dcf340a5ab207a3fb2f4a8dac9f2750',
        ...previous,
        parseError,
        loadError,
        currentGet: { http: get.statusCode, body: getBody },
        currentCommand: { http: post.statusCode, body: postBody },
        after,
      };
    } finally {
      if (app) await app.close();
      await pool.end();
      await database.drop();
    }
  }
} finally {
  await rm(snapshot, { recursive: true, force: true });
}
await mkdir('reviews/evidence/gate-03/retest-2', { recursive: true });
await writeFile(
  'reviews/evidence/gate-03/retest-2/compatibility-results.json',
  JSON.stringify(results, null, 2) + '\n',
);
console.log(
  JSON.stringify(
    Object.fromEntries(
      Object.entries(results).map(([key, value]) => [
        key,
        {
          oldHttp: value.httpStatus,
          currentHttp: value.currentGet.http,
          commandHttp: value.currentCommand.http,
          eventSequence: value.event.sequence,
        },
      ]),
    ),
  ),
);
```
