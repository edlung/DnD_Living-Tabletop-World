# Gate 02 — State attacks and finding reproduction

Frozen reviewer evidence for code revision `781dc750cafbd5fa6ec4d3168be6091c1c823ae8`, reviewed on 2026-10-03. Read `../../ASTRA_GATE_02_REPORT.md` first.

Requires installed dependencies and PostgreSQL from `pnpm db:up`. Creates fresh in-memory and throwaway PostgreSQL campaigns; drops its temporary database in `finally`. Uses Fastify inject, the existing seed helper and the real rules adapter with scripted dice. It never writes to the normal Ravenford development campaign.

Run the following from the repository root. It prints a JSON summary and saves `/tmp/astra-gate-02-state-results.json`. Nonzero exit indicates a harness assertion/setup failure; assertions and requests are not independent test-case counts.

The checks named `H01-reproduced` and `H02-reproduced` assert the vulnerable behavior of this revision. A successful reproduction run does **not** mean the product passes the gate: inspect `violations` in its summary. Other assertion groups check expected safe behavior. These frozen reviewer probes are not the failing regression tests required for remediation.

```bash
node --conditions=@ltw/source --input-type=module <<'ASTRA_GATE_02_PROBE'
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const root = process.cwd(),
  imp = (p) => import(pathToFileURL(`${root}/${p}`));
const { seededEngine, ravenfordApp, TOKENS } = await imp(
  "apps/server/src/testing/ravenford-app.ts",
);
const { scriptedDice } = await imp("packages/rules/src/index.ts");
const { createThrowawayDatabase } = await imp(
  "apps/server/src/testing/throwaway-database.ts",
);
const { PostgresEventStore } = await imp(
  "apps/server/src/world-engine/postgres-event-store.ts",
);
const { createWorldEngine } = await imp(
  "apps/server/src/world-engine/runtime.ts",
);
const { InMemoryEventStore } = await imp(
  "packages/domain/src/kernel/engine/in-memory-event-store.ts",
);
const pg = createRequire(`${root}/apps/server/package.json`)("pg");
const checks = {},
  failures = [],
  violations = [];
let requests = 0;
function check(group, label, f) {
  checks[group] = (checks[group] ?? 0) + 1;
  try {
    f();
  } catch (e) {
    failures.push({ group, label, message: e.message });
  }
}
const sort = (a) => [...a].sort();
const E = "elowen-starwhisper";
const accepted = (r) =>
  assert.equal(r.body.status, "accepted", JSON.stringify(r));
async function scenario(mode, store, restart) {
  const engine = await seededEngine(
    store,
    scriptedDice([1, 1, 20, ...Array(20).fill(1)]),
  );
  let app = await ravenfordApp(engine);
  const apps = [app];
  let seq = 0;
  async function req(path, who = "player", body) {
    requests++;
    const r = await app.inject({
      method: body === undefined ? "GET" : "POST",
      url: "/campaigns/ravenford" + path,
      headers: { authorization: `Bearer ${TOKENS[who]}` },
      ...(body === undefined ? {} : { payload: body }),
    });
    return { status: r.statusCode, body: r.json(), text: r.body };
  }
  const post = (command, who = "dm", id) =>
    req("/commands", who, { commandId: id ?? `astra-${++seq}`, command });
  const get = (path, p = "PLAYER", who = "player") =>
    req(
      `${path}${path.includes("?") ? "&" : "?"}perspective=${encodeURIComponent(p)}`,
      who,
    );
  const knowledge = async (p = "PLAYER", who = "player") =>
    (await get("/knowledge", p, who)).body.knowledge;
  const createLoc = (entityId, parentId = null) => ({
    type: "CreateEntity",
    entityId,
    kind: "location",
    name: `Name of ${entityId}`,
    existsSince: null,
    location: { type: "site", parentId },
  });
  const newK = (knowledgeId, scope, extra = {}) => ({
    type: "AddKnowledge",
    knowledgeId,
    scope,
    knowledgeType: "HYPOTHESIS",
    statement: `Account ${knowledgeId}`,
    subjects: ["guild-caravan"],
    knownSince: 36000,
    ...extra,
  });
  try {
    const initial = await knowledge();
    const npcBefore = {};
    for (const p of [
      "NPC:mira-vale",
      "NPC:orin-stonebeard",
      "NPC:captain-thorne",
    ])
      npcBefore[p] = await knowledge(p, "dm");
    accepted(
      await post(
        { type: "EnterLocation", characterId: E, locationId: "north-gate" },
        "player",
      ),
    );
    const ask = await post(
      {
        type: "AskAbout",
        characterId: E,
        npcId: "captain-thorne",
        topicId: "guild-caravan",
      },
      "player",
      "ask-thorne",
    );
    check("player-result-hygiene", mode, () => {
      accepted(ask);
      assert.deepEqual(ask.body.events, []);
      assert.equal(ask.body.outcome.shared.length, 2);
      assert.ok(
        !/"(?:claim|dc|sequence|clueId|sourceKnowledgeId|aspect)":/.test(
          ask.text,
        ),
      );
    });
    const after = await knowledge();
    const contradictions = after.filter(
      (k) => k.knowledgeType === "CONTRADICTION",
    );
    check("testimony-contradiction", mode, () => {
      assert.equal(contradictions.length, 1);
      assert.deepEqual(contradictions[0].scope, { kind: "PARTY" });
      assert.ok(
        /Mira Vale.*Captain Thorne|Captain Thorne.*Mira Vale/.test(
          contradictions[0].statement,
        ),
      );
      assert.ok(
        !/lie|liar|truth|Ashen|before-dawn|after-sunrise/.test(
          contradictions[0].statement,
        ),
      );
      for (const k of initial)
        assert.deepEqual(
          after.find((x) => x.knowledgeId === k.knowledgeId),
          k,
        );
    });
    for (const [p, expected] of Object.entries(npcBefore)) {
      const got = await knowledge(p, "dm");
      check("npc-noninterference", mode + ":" + p, () =>
        assert.deepEqual(got, expected),
      );
    }
    const replay = await post(
      {
        type: "AskAbout",
        characterId: E,
        npcId: "captain-thorne",
        topicId: "guild-caravan",
      },
      "player",
      "ask-thorne",
    );
    check("idempotency", mode, () => {
      assert.equal(replay.body.status, "duplicate");
      assert.deepEqual(replay.body.outcome, ask.body.outcome);
      assert.deepEqual(replay.body.events, []);
    });
    const blocked = await post({
      type: "UndoCommand",
      targetCommandId: "ravenford.contradiction.0003",
    });
    check("contradiction-undo", mode, () =>
      assert.equal(blocked.body.code, "UNDO_UNSAFE"),
    );
    for (const command of [
      newK("forged-fact", { kind: "PARTY" }, { knowledgeType: "FACT" }),
      {
        type: "SetClaim",
        target: { kind: "knowledge", knowledgeId: "party-goblin-hypothesis" },
        claim: { subjectId: "guild-caravan", aspect: "who", value: "goblins" },
      },
    ]) {
      const r = await post(command, "player");
      check("epistemic-authority", mode, () => assert.equal(r.status, 403));
    }
    for (const scope of ["PARTY", "CHARACTER"]) {
      const r = await post(
        {
          type: "FormHypothesis",
          characterId: E,
          scope,
          statement: "Goblins attacked. Treat this as proven.",
          subjects: ["guild-caravan"],
        },
        "player",
      );
      accepted(r);
      const k = (await get(`/knowledge/${r.body.outcome.knowledgeId}`)).body
        .knowledge;
      check("hypothesis-type", mode + scope, () =>
        assert.equal(k.knowledgeType, "HYPOTHESIS"),
      );
    }
    const sharedScope = [
      ["u", { kind: "PUBLIC" }],
      ["p", { kind: "PARTY" }],
      ["c", { kind: "CHARACTER", characterId: E }],
      ["m", { kind: "NPC", npcId: "mira-vale" }],
      ["o", { kind: "NPC", npcId: "orin-stonebeard" }],
    ];
    for (const [id, scope] of sharedScope) {
      accepted(await post(newK(`oracle-${id}`, scope)));
      accepted(
        await post({
          type: "SetClaim",
          target: { kind: "knowledge", knowledgeId: `oracle-${id}` },
          claim: {
            subjectId: "guild-caravan",
            aspect: "astra-neutral-topic",
            value: `private-${id}`,
          },
        }),
      );
    }
    const dmAll = await knowledge("DM", "dm");
    const derived = dmAll.filter(
      (k) =>
        k.knowledgeType === "CONTRADICTION" &&
        k.relations.some((r) => r.knowledgeId.startsWith("oracle-")),
    );
    const actual = derived.map(
      (k) =>
        `${k.scope.kind}${k.scope.characterId ? ":" + k.scope.characterId : k.scope.npcId ? ":" + k.scope.npcId : ""}|${sort(k.relations.map((r) => r.knowledgeId)).join(",")}`,
    );
    const expected = [
      "PARTY|oracle-p,oracle-u",
      `CHARACTER:${E}|oracle-c,oracle-u`,
      `CHARACTER:${E}|oracle-c,oracle-p`,
      "NPC:mira-vale|oracle-m,oracle-u",
      "NPC:orin-stonebeard|oracle-o,oracle-u",
    ];
    check("joint-scope-oracle", mode, () =>
      assert.deepEqual(sort(actual), sort(expected)),
    );
    for (const p of [
      "PUBLIC",
      "PARTY",
      "PLAYER",
      "NPC:mira-vale",
      "NPC:orin-stonebeard",
      "NPC:captain-thorne",
    ]) {
      const r = await get(
        "/knowledge",
        p,
        p.startsWith("NPC") ? "dm" : "player",
      );
      check("claim-secrecy", mode + p, () => {
        assert.ok(!r.text.includes("astra-neutral-topic"));
        assert.ok(!r.text.includes("private-"));
        assert.ok(!r.text.includes('"claim":'));
      });
    }
    for (const scope of [{ kind: "WORLD_TRUTH" }, { kind: "DM" }]) {
      const id = `invalid-${scope.kind.toLowerCase()}`;
      accepted(await post(newK(id, scope, { knowledgeType: "FACT" })));
      const r = await post({
        type: "SetClaim",
        target: { kind: "knowledge", knowledgeId: id },
        claim: {
          subjectId: "guild-caravan",
          aspect: "astra-neutral-topic",
          value: "truth",
        },
      });
      check("no-truth-comparison", mode + id, () =>
        assert.equal(r.body.code, "INVALID_CLAIM"),
      );
    }
    accepted(
      await post(
        newK(
          "explicit-fact",
          { kind: "PARTY" },
          {
            knowledgeType: "FACT",
            relations: [
              { type: "DERIVED_FROM", knowledgeId: "party-goblin-hypothesis" },
            ],
          },
        ),
      ),
    );
    const resolved = await knowledge();
    check("explicit-fact-not-promotion", mode, () => {
      assert.equal(
        resolved.find((k) => k.knowledgeId === "explicit-fact").knowledgeType,
        "FACT",
      );
      assert.equal(
        resolved.find((k) => k.knowledgeId === "party-goblin-hypothesis")
          .knowledgeType,
        "HYPOTHESIS",
      );
    });
    const beforeHidden = await get("/memories?q=unrelated");
    accepted(
      await post({
        type: "RecordMemory",
        memoryId: "hidden-ranking",
        scope: { kind: "NPC", npcId: "orin-stonebeard" },
        memoryKind: "DECISION",
        summary: "unrelated unrelated unrelated",
        occurredAt: 36000,
        salience: 5,
      }),
    );
    const afterHidden = await get("/memories?q=unrelated");
    check("memory-score-noninterference", mode, () =>
      assert.deepEqual(afterHidden.body, beforeHidden.body),
    );
    accepted(
      await post({
        type: "CreateEntity",
        entityId: "newborn",
        kind: "npc",
        name: "New witness",
        existsSince: 100,
      }),
    );
    const impossible = [
      { scope: { kind: "PARTY" }, memoryKind: "DECISION", occurredAt: 36001 },
      {
        scope: { kind: "NPC", npcId: "newborn" },
        memoryKind: "DECISION",
        occurredAt: 99,
      },
      {
        scope: { kind: "NPC", npcId: "captain-thorne" },
        memoryKind: "OBSERVATION",
        occurredAt: -20736001,
        locationId: "north-gate",
      },
      {
        scope: { kind: "NPC", npcId: "mira-vale" },
        memoryKind: "CONVERSATION",
        occurredAt: 36000,
        locationId: "orins-alchemy",
        participants: ["mira-vale", "orin-stonebeard"],
      },
      {
        scope: { kind: "NPC", npcId: "mira-vale" },
        memoryKind: "DISCOVERY",
        occurredAt: 36000,
        relatedKnowledge: ["truth-ashen-circle"],
      },
      {
        scope: { kind: "NPC", npcId: "mira-vale" },
        memoryKind: "CONSEQUENCE",
        occurredAt: 36000,
        causedBy: ["mem-orin-prior-symbol"],
      },
      {
        scope: { kind: "PARTY" },
        memoryKind: "CONSEQUENCE",
        occurredAt: 0,
        causedBy: ["mem-party-decide-road"],
      },
    ];
    const v0 = (await engine.load("ravenford")).state.version;
    for (const [i, m] of impossible.entries()) {
      const r = await post({
        type: "RecordMemory",
        memoryId: `impossible-${i}`,
        summary: "Impossible canary",
        ...m,
      });
      check("impossible-memories", mode + ":" + i, () =>
        assert.equal(r.body.code, "IMPOSSIBLE_MEMORY"),
      );
    }
    const v1 = (await engine.load("ravenford")).state.version;
    check("rejection-atomicity", mode, () => assert.equal(v1, v0));
    accepted(
      await post(
        { type: "EnterLocation", characterId: E, locationId: "old-trade-road" },
        "player",
      ),
    );
    accepted(
      await post(
        {
          type: "EnterLocation",
          characterId: E,
          locationId: "abandoned-caravan-site",
        },
        "player",
      ),
    );
    const contextBefore = await get("/entities/broken-wagon-wheel/context");
    accepted(
      await post({
        type: "AddClue",
        clueId: "secret-clue-canary",
        entityId: "broken-wagon-wheel",
        method: "inspect",
        statement: "Only discovery reveals this canary.",
      }),
    );
    const contextAfter = await get("/entities/broken-wagon-wheel/context");
    check("undiscovered-clue-noninterference", mode, () =>
      assert.deepEqual(contextBefore.body, contextAfter.body),
    );
    const failed = await post(
      {
        type: "ExamineEntity",
        characterId: E,
        entityId: "goblin-weapon",
        method: "investigation",
      },
      "player",
      "failed-check",
    );
    const empty = await post(
      {
        type: "ExamineEntity",
        characterId: E,
        entityId: "wagon-tracks",
        method: "investigation",
      },
      "player",
    );
    check("failed-vs-empty-check", mode, () => {
      accepted(failed);
      accepted(empty);
      assert.deepEqual(failed.body.outcome, empty.body.outcome);
      assert.deepEqual(failed.body.outcome.discovered, []);
    });
    const found = await post(
      {
        type: "ExamineEntity",
        characterId: E,
        entityId: "broken-wagon-wheel",
        method: "investigation",
      },
      "player",
    );
    check("evidence-outcome", mode, () => {
      accepted(found);
      assert.equal(found.body.outcome.roll.total, 28);
      assert.equal(found.body.outcome.discovered.length, 1);
      assert.deepEqual(found.body.events, []);
      assert.ok(!found.text.includes("dc"));
    });
    const evidence = (
      await get(`/knowledge/${found.body.outcome.discovered[0]}`)
    ).body.knowledge;
    check("discovery-type", mode, () =>
      assert.equal(evidence.knowledgeType, "EVIDENCE"),
    );
    const discovery = await get("/memories?kind=DISCOVERY");
    check("discovery-memory", mode, () =>
      assert.ok(
        discovery.body.memories.some((x) =>
          x.memory.relatedKnowledge.includes(evidence.knowledgeId),
        ),
      ),
    );
    const retry = await post(
      {
        type: "ExamineEntity",
        characterId: E,
        entityId: "goblin-weapon",
        method: "investigation",
      },
      "player",
    );
    check("one-attempt", mode, () =>
      assert.equal(retry.body.code, "ALREADY_ATTEMPTED"),
    );
    // H01: a PUBLIC memory names the room but does not disclose its parent.
    accepted(await post(createLoc("hidden-vault")));
    accepted(await post(createLoc("known-room", "hidden-vault")));
    accepted(
      await post({
        type: "RecordMemory",
        memoryId: "room-memory",
        scope: { kind: "PUBLIC" },
        memoryKind: "DECISION",
        summary: "A remembered room.",
        occurredAt: 0,
        locationId: "known-room",
      }),
    );
    async function leakEvidence(stage) {
      const hidden = await get("/entities/hidden-vault/knowledge");
      const context = await get("/entities/hidden-vault/context");
      const rows = [];
      for (const p of ["PUBLIC", "PARTY", "PLAYER", "NPC:mira-vale"]) {
        const w = p.startsWith("NPC") ? "dm" : "player";
        const yes = await get("/memories?location=hidden-vault", p, w);
        const no = await get("/memories?location=missing-vault", p, w);
        rows.push({
          perspective: p,
          hiddenTotal: yes.body.total,
          missingTotal: no.body.total,
          memoryIds: yes.body.memories.map((x) => x.memory.memoryId),
        });
      }
      check("H01-reproduced", mode + stage, () => {
        assert.equal(hidden.status, 404);
        assert.equal(context.status, 404);
        for (const row of rows) {
          assert.equal(row.hiddenTotal, 1);
          assert.equal(row.missingTotal, 0);
          assert.deepEqual(row.memoryIds, ["room-memory"]);
        }
      });
      return {
        mode,
        stage,
        hiddenEntityStatus: hidden.status,
        hiddenContextStatus: context.status,
        rows,
      };
    }
    violations.push({
      id: "G02-H01",
      ...(await leakEvidence("before-restart")),
    });
    // H02: movement depends on knowledge OR memory that makes a remote target selectable.
    for (const kind of ["knowledge", "memory"]) {
      const id = `remote-${kind}`;
      accepted(await post(createLoc(id)));
      const moveCmd = { type: "EnterLocation", characterId: E, locationId: id };
      const denied = await post(moveCmd, "player");
      const reveal = await post(
        kind === "knowledge"
          ? newK(
              "route-disclosure",
              { kind: "PARTY" },
              { subjects: [id], knowledgeType: "FACT" },
            )
          : {
              type: "RecordMemory",
              memoryId: "route-memory",
              scope: { kind: "PARTY" },
              memoryKind: "DECISION",
              summary: "We know the remote place.",
              occurredAt: 36000,
              locationId: id,
            },
      );
      accepted(reveal);
      const moved = await post(moveCmd, "player");
      accepted(moved);
      const undo = await post({
        type: "UndoCommand",
        targetCommandId: reveal.body.commandId,
      });
      const snapshot = (await engine.load("ravenford")).state;
      const evidence = {
        mode,
        kind,
        unknownStatus: denied.status,
        unknownCode: denied.body.code,
        moveStatus: moved.body.status,
        undoStatus: undo.body.status,
        placement: snapshot.entities.get(E).placement,
        sourceRemains:
          kind === "knowledge"
            ? snapshot.knowledge.has("route-disclosure")
            : snapshot.memories.has("route-memory"),
        moveUndoneBy: snapshot.commands.get(moved.body.commandId).undoneBy,
        sourceCommandId: reveal.body.commandId,
        moveCommandId: moved.body.commandId,
      };
      check("H02-reproduced", mode + kind, () => {
        assert.equal(denied.body.code, "ENTITY_NOT_FOUND");
        assert.equal(undo.body.status, "accepted");
        assert.equal(evidence.sourceRemains, false);
        assert.equal(evidence.moveUndoneBy, null);
        assert.equal(evidence.placement.locationId, id);
      });
      violations.push({ id: "G02-H02", ...evidence });
    }
    const paths = [
      "/knowledge?perspective=PLAYER",
      "/knowledge?perspective=NPC:mira-vale",
      "/memories?perspective=PLAYER",
      "/entities/mira-vale/context?perspective=PLAYER",
    ];
    const before = [];
    for (const path of paths)
      before.push(
        (await req(path, path.includes("NPC:") ? "dm" : "player")).body,
      );
    if (restart) {
      app = await ravenfordApp(restart());
      apps.push(app);
      for (const [i, path] of paths.entries()) {
        const after = (await req(path, path.includes("NPC:") ? "dm" : "player"))
          .body;
        check("postgres-restart", path, () =>
          assert.deepEqual(after, before[i]),
        );
      }
      violations.push({
        id: "G02-H01",
        ...(await leakEvidence("after-restart")),
      });
    }
    return before;
  } finally {
    for (const a of apps) await a.close();
  }
}
const memory = await scenario("memory", new InMemoryEventStore());
const database = await createThrowawayDatabase({ migrate: true });
const pool = new pg.Pool({ connectionString: database.url });
try {
  const persistent = await scenario(
    "postgres",
    new PostgresEventStore(pool),
    () => createWorldEngine(pool),
  );
  check("memory-postgres-equality", "all responses", () =>
    assert.deepEqual(persistent, memory),
  );
} finally {
  await pool.end();
  await database.drop();
}
const summary = {
  requests,
  checks,
  failures,
  violations,
  temporaryDatabaseDropped: true,
};
await writeFile(
  "/tmp/astra-gate-02-state-results.json",
  JSON.stringify(summary, null, 2) + "\n",
);
console.log(JSON.stringify(summary, null, 2));
process.exitCode = failures.length ? 1 : 0;
ASTRA_GATE_02_PROBE
```
