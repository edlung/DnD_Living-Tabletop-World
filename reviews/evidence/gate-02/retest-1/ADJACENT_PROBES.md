# Gate 02 retest 1 — Adjacent undo and containment probes

Code revision: `757db1066fc4b8fd14e26244c1e63adbdd0aa281`. Run from the repository root.

Uses the real HTTP app through `inject()`, isolated in-memory state and a migrated throwaway PostgreSQL database. No live server is needed. The PostgreSQL variant reloads with a fresh engine before the finding-producing undos. PostgreSQL must be available through the development defaults.

The assertions for `actor-assignment`, `hypothesis-actor-assignment` and `empty-inspection-undo-lock` deliberately assert the observed defects. Successful execution reproduces G02-H03 and G02-M01; it is **not** a passing product regression test. Other assertions exercise expected safe behavior.

The recipe writes its JSON summary to `/tmp/astra-gate-02-retest1-adjacent-results.json`. The recorded run is preserved under `adjacent` in [results.json](results.json). Scenario writes never use the ordinary development campaign database; both scenario recipes drop their temporary database in `finally`.

```bash
cat > /tmp/astra-gate-02-retest1-adjacent.mjs <<'ASTRA_PROBE'
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
const imp = (p) => import(pathToFileURL(`${process.cwd()}/${p}`));
const { seededEngine, ravenfordApp, TOKENS } = await imp(
  "apps/server/src/testing/ravenford-app.ts",
);
const { InMemoryEventStore } = await imp(
  "packages/domain/src/kernel/engine/in-memory-event-store.ts",
);
const { PostgresEventStore } = await imp(
  "apps/server/src/world-engine/postgres-event-store.ts",
);
const { createWorldEngine } = await imp(
  "apps/server/src/world-engine/runtime.ts",
);
const { createThrowawayDatabase } = await imp(
  "apps/server/src/testing/throwaway-database.ts",
);
const { replay } = await imp("packages/domain/src/kernel/evolve.ts");
const { scriptedDice } = await imp("packages/rules/src/index.ts");
const pg = createRequire(`${process.cwd()}/apps/server/package.json`)("pg");
const E = "elowen-starwhisper";
let requests = 0;
const observations = [];
const controls = [];
async function scenario(mode, store, restart) {
  let engine = await seededEngine(store, scriptedDice(Array(20).fill(20)));
  let app = await ravenfordApp(engine);
  let seq = 0;
  async function reload() {
    if (!restart) return;
    await app.close();
    engine = restart();
    app = await ravenfordApp(engine);
  }
  async function post(command, who = "dm", key = `adj-${++seq}`) {
    requests++;
    const r = await app.inject({
      method: "POST",
      url: "/campaigns/ravenford/commands",
      headers: { authorization: `Bearer ${TOKENS[who]}` },
      payload: { commandId: key, command },
    });
    return { http: r.statusCode, ...r.json() };
  }
  const accept = (r) => {
    assert.equal(r.status, "accepted", JSON.stringify(r));
    return r.commandId;
  };
  const undo = (id) => post({ type: "UndoCommand", targetCommandId: id });
  const state = async () => (await engine.load("ravenford")).state;
  const loc = (id) => ({
    type: "CreateEntity",
    entityId: id,
    kind: "location",
    name: id,
    existsSince: null,
    location: { type: "site", parentId: null },
  });
  const reveal = (id, place, scope = { kind: "PARTY" }) => ({
    type: "AddKnowledge",
    knowledgeId: id,
    scope,
    knowledgeType: "FACT",
    statement: `Known ${place}`,
    subjects: [place],
    knownSince: 36000,
  });
  try {
    // Authorization premise: use a new character so seed memories/records cannot mask it.
    accept(
      await post({
        type: "CreateEntity",
        entityId: "guest-character",
        kind: "character",
        name: "Guest",
        existsSince: null,
      }),
    );
    const move = {
      type: "EnterLocation",
      characterId: "guest-character",
      locationId: "market-square",
    };
    const beforeAssignment = await post(move, "outsider", "auth-before");
    assert.equal(beforeAssignment.http, 404, JSON.stringify(beforeAssignment));
    const assignment = accept(
      await post(
        {
          type: "AssignCharacter",
          characterId: "guest-character",
          playerActorId: "outsider",
        },
        "dm",
        "auth-assign",
      ),
    );
    const moved = accept(await post(move, "outsider", "auth-move"));
    await reload();
    const assignmentUndo = await undo(assignment);
    const authSnapshot = await engine.load("ravenford");
    const retried = await post(
      { ...move, locationId: "north-gate" },
      "outsider",
      "auth-after",
    );
    const authEvidence = {
      case: "actor-assignment",
      mode,
      beforeAssignment,
      assignment,
      moved,
      assignmentUndo,
      assignmentStillPresent: authSnapshot.state.roster.has("guest-character"),
      placement: authSnapshot.state.entities.get("guest-character").placement,
      movement: authSnapshot.state.commands.get(moved),
      subsequentAction: retried,
      premiseEvents: authSnapshot.history
        .filter((e) => e.causation.commandId === moved)
        .map((e) => ({ type: e.type, payload: e.payload })),
    };
    observations.push(authEvidence);
    assert.equal(assignmentUndo.status, "accepted"); // reproduction assertion, not safe behavior
    assert.equal(authEvidence.assignmentStillPresent, false);
    assert.equal(authEvidence.movement.undoneBy, null);
    assert.equal(retried.http, 404, JSON.stringify(retried));
    assert.deepEqual(replay(authSnapshot.history), authSnapshot.state);

    // CHARACTER-only hypothesis has the same omitted authorization dependency.
    const assignment2 = accept(
      await post(
        {
          type: "AssignCharacter",
          characterId: "guest-character",
          playerActorId: "outsider",
        },
        "dm",
        "hyp-assign",
      ),
    );
    const hypothesis = accept(
      await post(
        {
          type: "FormHypothesis",
          characterId: "guest-character",
          scope: "CHARACTER",
          statement: "A private guess.",
          subjects: [],
        },
        "outsider",
        "hyp-form",
      ),
    );
    await reload();
    const hypothesisAssignmentUndo = await undo(assignment2);
    const hs = await engine.load("ravenford");
    assert.equal(hypothesisAssignmentUndo.status, "accepted"); // reproduction assertion
    assert.equal(hs.state.roster.has("guest-character"), false);
    assert.equal(hs.state.commands.get(hypothesis).undoneBy, null);
    const record = [...hs.state.knowledge.values()].find(
      (k) => k.origin.commandId === hypothesis,
    );
    assert.equal(record.knowledgeType, "HYPOTHESIS");
    observations.push({
      case: "hypothesis-actor-assignment",
      mode,
      assignment: assignment2,
      hypothesis,
      assignmentUndo: hypothesisAssignmentUndo,
      assignmentStillPresent: false,
      hypothesisStillPresent: record.knowledgeId,
      command: hs.state.commands.get(hypothesis),
      premises: hs.history
        .filter(
          (e) =>
            e.causation.commandId === hypothesis &&
            e.type === "PremisesRecorded",
        )
        .map((e) => e.payload),
    });

    // Knowledge and memory order must use the earliest disclosure across both kinds.
    for (const first of ["knowledge", "memory"]) {
      const place = `earliest-${first}`;
      accept(await post(loc(place)));
      const k = () => post(reveal(`disclosure-${first}`, place));
      const m = () =>
        post({
          type: "RecordMemory",
          memoryId: `memory-${first}`,
          scope: { kind: "PARTY" },
          memoryKind: "DECISION",
          summary: "Remember the way",
          occurredAt: 36000,
          locationId: place,
        });
      const a = accept(await (first === "knowledge" ? k() : m()));
      const b = accept(await (first === "knowledge" ? m() : k()));
      const movedId = accept(
        await post(
          { type: "EnterLocation", characterId: E, locationId: place },
          "player",
        ),
      );
      accept(await undo(b));
      const prior = await state();
      const blocked = await undo(a);
      assert.equal(blocked.code, "UNDO_UNSAFE");
      assert.deepEqual(
        blocked.details.blockers.map((x) => x.commandId),
        [movedId],
      );
      assert.deepEqual(await state(), prior);
      accept(await undo(movedId));
      accept(await undo(a));
      controls.push({
        mode,
        case: `earliest-${first}`,
        blocked: blocked.code,
        redundantUndo: "accepted",
        reverseUndo: "accepted",
      });
    }

    // Adjacent known-chain contract: known outer + known inner but unknown middle.
    for (const id of ["outer", "middle", "inner"]) {
      const c = loc(`chain-${id}`);
      c.location.parentId =
        id === "outer" ? null : `chain-${id === "middle" ? "outer" : "middle"}`;
      accept(await post(c));
    }
    accept(
      await post(
        reveal("chain-outer-known", "chain-outer", { kind: "PUBLIC" }),
      ),
    );
    accept(
      await post({
        type: "RecordMemory",
        memoryId: "chain-memory",
        scope: { kind: "PUBLIC" },
        memoryKind: "DECISION",
        summary: "Chain memory",
        occurredAt: 0,
        locationId: "chain-inner",
      }),
    );
    const views = [
      ["PUBLIC", "player"],
      ["PARTY", "player"],
      ["PLAYER", "player"],
      ["NPC:mira-vale", "dm"],
    ];
    async function recall(p, who, location) {
      requests++;
      const r = await app.inject({
        method: "GET",
        url: `/campaigns/ravenford/memories?perspective=${p}&location=${location}&limit=50`,
        headers: { authorization: `Bearer ${TOKENS[who]}` },
      });
      assert.equal(r.statusCode, 200);
      return r.json();
    }
    for (const [p, who] of views) {
      assert.deepEqual(
        await recall(p, who, "chain-outer"),
        await recall(p, who, "missing-outer"),
      );
      assert.equal((await recall(p, who, "chain-inner")).total, 1);
    }
    assert.equal((await recall("DM", "dm", "chain-outer")).total, 1);
    accept(
      await post(
        reveal("chain-middle-known", "chain-middle", { kind: "PUBLIC" }),
      ),
    );
    for (const [p, who] of views)
      assert.equal((await recall(p, who, "chain-outer")).total, 1);
    controls.push({
      mode,
      case: "known-chain",
      unknownIntermediate: "equal-to-absent",
      authorizedNesting: "available",
      dmNesting: "available",
    });

    // A no-discovery inspect is accepted but cannot itself be undone.
    accept(await post(loc("empty-remote")));
    const disclosure = accept(
      await post(reveal("empty-route", "empty-remote"), "dm", "empty-reveal"),
    );
    const entered = accept(
      await post(
        { type: "EnterLocation", characterId: E, locationId: "empty-remote" },
        "player",
        "empty-move",
      ),
    );
    const inspected = await post(
      {
        type: "ExamineEntity",
        characterId: E,
        entityId: "empty-remote",
        method: "inspect",
      },
      "player",
      "empty-inspect",
    );
    accept(inspected);
    assert.deepEqual(inspected.events, []);
    await reload();
    const prior = await state();
    const disclosureUndo = await undo(disclosure);
    const moveUndo = await undo(entered);
    const inspectUndo = await undo(inspected.commandId);
    assert.equal(disclosureUndo.code, "UNDO_UNSAFE");
    assert.equal(moveUndo.code, "UNDO_UNSAFE");
    assert.equal(inspectUndo.code, "NO_EFFECT"); // reproduction assertion, not safe behavior
    assert.deepEqual(await state(), prior);
    const snapshot = await engine.load("ravenford");
    assert.deepEqual(replay(snapshot.history), snapshot.state);
    observations.push({
      case: "empty-inspection-undo-lock",
      mode,
      disclosure,
      entered,
      inspected,
      disclosureUndo,
      moveUndo,
      inspectUndo,
      effectiveCommands: [disclosure, entered, inspected.commandId].map((id) =>
        snapshot.state.commands.get(id),
      ),
      readOnlyInspection: snapshot.history
        .filter((e) => e.causation.commandId === inspected.commandId)
        .map((e) => ({ type: e.type, payload: e.payload })),
      unchangedOnRejectedUndo: true,
      replayEqual: true,
    });
  } finally {
    await app.close();
  }
}
await scenario("memory", new InMemoryEventStore());
const db = await createThrowawayDatabase({ migrate: true });
const pool = new pg.Pool({ connectionString: db.url });
try {
  await scenario("postgres-reloaded", new PostgresEventStore(pool), () =>
    createWorldEngine(pool),
  );
} finally {
  await pool.end();
  await db.drop();
}
const result = {
  requests,
  controls,
  observations,
  temporaryDatabaseDropped: true,
};
await writeFile(
  "/tmp/astra-gate-02-retest1-adjacent-results.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));
ASTRA_PROBE
node --conditions=@ltw/source /tmp/astra-gate-02-retest1-adjacent.mjs
```
