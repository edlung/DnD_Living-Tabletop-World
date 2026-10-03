# Gate 02 retest 2 — H03/M01 retest and adjacent controls

Code revision: `017ab0b4fb1386dfc994a46bb4d82b762aaba237`. Run from the repository root.

The prior retest's H03/M01 exploit assertions now require safe behavior, exact undo blockers, unchanged state on rejection and successful reverse-order recovery. Also checks earliest disclosure selection, redundant disclosure undo and authorized location containment. PostgreSQL must be available at the development defaults; no live server is required.

Mutations use isolated seeded memory stores and migrated throwaway PostgreSQL databases. Temporary databases are dropped in `finally`; the ordinary development campaign is not mutated.

All assertions require the expected safe behavior. The recorded run is in `adjacent` in [results.json](results.json). The recipe writes `/tmp/astra-gate-02-retest2-adjacent-results.json`.

```bash
cat > /tmp/astra-gate-02-retest2-adjacent.mjs <<'ASTRA_PROBE'
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
    // Repeat both original H03 exploits, now requiring dependency preservation.
    accept(
      await post({
        type: "CreateEntity",
        entityId: "guest-character",
        kind: "character",
        name: "Guest",
        existsSince: null,
      }),
    );
    for (const kind of ["move", "hypothesis"]) {
      const action =
        kind === "move"
          ? {
              type: "EnterLocation",
              characterId: "guest-character",
              locationId: "market-square",
            }
          : {
              type: "FormHypothesis",
              characterId: "guest-character",
              scope: "CHARACTER",
              statement: "A private guess.",
              subjects: [],
            };
      const before = await post(action, "outsider");
      assert.equal(before.http, 404);
      const assignment = accept(
        await post({
          type: "AssignCharacter",
          characterId: "guest-character",
          playerActorId: "outsider",
        }),
      );
      const acted = await post(action, "outsider");
      const actionId = accept(acted);
      assert.deepEqual(acted.events, []);
      assert.ok(!JSON.stringify(acted).includes("controller"));
      await reload();
      const prior = await state();
      const blocked = await undo(assignment);
      assert.equal(blocked.code, "UNDO_UNSAFE");
      assert.deepEqual(
        blocked.details.blockers.map((x) => x.commandId),
        [actionId],
      );
      assert.deepEqual(await state(), prior);
      const h = (await engine.load("ravenford")).history;
      const premises = h.find(
        (e) =>
          e.causation.commandId === actionId && e.type === "PremisesRecorded",
      ).payload.premises;
      assert.deepEqual(
        premises.filter((p) => p.kind === "controller"),
        [{ kind: "controller", playerActorId: "outsider" }],
      );
      const actionUndo = await undo(actionId);
      accept(actionUndo);
      const assignmentUndo = await undo(assignment);
      accept(assignmentUndo);
      await reload();
      const after = await engine.load("ravenford");
      assert.equal(after.state.roster.has("guest-character"), false);
      assert.ok(after.state.commands.get(actionId).undoneBy);
      if (kind === "move")
        assert.equal(
          after.state.entities.get("guest-character").placement,
          null,
        );
      else
        assert.equal(
          [...after.state.knowledge.values()].some(
            (k) => k.origin.commandId === actionId,
          ),
          false,
        );
      assert.deepEqual(replay(after.history), after.state);
      assert.equal((await post(action, "outsider")).http, 404);
      observations.push({
        case: `H03-${kind}-fixed`,
        mode,
        assignment,
        actionId,
        blocked,
        premises,
        actionUndo,
        assignmentUndo,
        reverseStateVerified: true,
      });
    }

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

    // G02-M01: preserve real dependencies, then release them by explicit undo.
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
    assert.equal(disclosureUndo.code, "UNDO_UNSAFE");
    assert.equal(moveUndo.code, "UNDO_UNSAFE");
    assert.deepEqual(await state(), prior);
    const inspectUndo = await post(
      { type: "UndoCommand", targetCommandId: inspected.commandId },
      "dm",
      "undo-empty-inspect",
    );
    accept(inspectUndo);
    await reload();
    const compensation = (await engine.load("ravenford")).history.find(
      (e) => e.causation.commandId === inspectUndo.commandId,
    );
    assert.equal(compensation.type, "CommandUndone");
    assert.deepEqual(compensation.payload.restores, []);
    const duplicate = await post(
      { type: "UndoCommand", targetCommandId: inspected.commandId },
      "dm",
      "undo-empty-inspect",
    );
    assert.equal(duplicate.status, "duplicate");
    assert.deepEqual(duplicate.events, inspectUndo.events);
    const afterUndo = await state();
    assert.equal((await undo(inspected.commandId)).code, "ALREADY_UNDONE");
    assert.equal(
      (await undo(inspectUndo.commandId)).code,
      "UNDO_NOT_SUPPORTED",
    );
    assert.deepEqual(await state(), afterUndo);
    accept(await undo(entered));
    accept(await undo(disclosure));
    await reload();
    const complete = await state();
    assert.equal(complete.knowledge.has("empty-route"), false);
    assert.equal(
      complete.entities.get(E).placement.locationId,
      prior.entities.get(E).placement.locationId === "empty-remote"
        ? "market-square"
        : "unexpected",
    );
    for (const id of [disclosure, entered, inspected.commandId])
      assert.ok(complete.commands.get(id).undoneBy);
    const snapshot = await engine.load("ravenford");
    assert.deepEqual(replay(snapshot.history), snapshot.state);
    observations.push({
      case: "M01-recovery-fixed",
      mode,
      disclosure,
      entered,
      inspected,
      disclosureUndo,
      moveUndo,
      inspectUndo,
      duplicate,
      emptyCompensation: compensation.payload,
      chainFullyUndone: true,
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
  "/tmp/astra-gate-02-retest2-adjacent-results.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));
ASTRA_PROBE
node --conditions=@ltw/source /tmp/astra-gate-02-retest2-adjacent.mjs
```
