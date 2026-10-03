# Gate 02 retest 2 — Authority, recovery, contradiction identity and concurrency

Code revision: `017ab0b4fb1386dfc994a46bb4d82b762aaba237`. Run from the repository root.

Exercises all four player-command families, perceived/public movement, DM and trusted internal system authority, multiple empty inspections and clock recovery, contradiction retry/undo/redetection, and 16 assignment-undo races. PostgreSQL uses two engine instances for races. Race winners and request counts can vary; assertions check the safety invariant. Uses the repository's re-decision oracle as an additional check alongside replay and integrity. PostgreSQL must be available at the development defaults; no live server is required.

Mutations use isolated seeded memory stores and migrated throwaway PostgreSQL databases. Temporary databases are dropped in `finally`; the ordinary development campaign is not mutated.

All assertions require the expected safe behavior. The recorded run is in `extended` in [results.json](results.json). The recipe writes `/tmp/astra-gate-02-retest2-extended-results.json`.

```bash
cat > /tmp/astra-gate-02-retest2-extended.mjs <<'ASTRA_PROBE'
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
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
const { scriptedDice, skillCheckPort } = await imp(
  "packages/rules/src/index.ts",
);
const { replay } = await imp("packages/domain/src/kernel/evolve.ts");
const { checkWorldIntegrity } = await imp(
  "packages/domain/src/kernel/projections/integrity.ts",
);
const { redecideEffective } = await imp(
  "packages/domain/src/kernel/testing/redecide.ts",
);
const pg = createRequire(`${process.cwd()}/apps/server/package.json`)("pg");
const E = "elowen-starwhisper";
let requests = 0,
  internalCommands = 0;
const results = [];
async function scenario(mode, store, restart) {
  let engine = await seededEngine(store, scriptedDice(Array(50).fill(20)));
  let app = await ravenfordApp(engine);
  let serial = 0;
  const state = async () => (await engine.load("ravenford")).state;
  async function reload() {
    if (!restart) return;
    await app.close();
    engine = restart();
    app = await ravenfordApp(engine);
  }
  async function post(
    command,
    who = "dm",
    key = `ext-${++serial}`,
    target = app,
  ) {
    requests++;
    const r = await target.inject({
      method: "POST",
      url: "/campaigns/ravenford/commands",
      headers: { authorization: `Bearer ${TOKENS[who]}` },
      payload: { commandId: key, command },
    });
    return { http: r.statusCode, ...r.json() };
  }
  const accepted = (r) => {
    assert.equal(r.status, "accepted", JSON.stringify(r));
    return r.commandId;
  };
  const undo = (id, key) =>
    post({ type: "UndoCommand", targetCommandId: id }, "dm", key);
  async function blocked(id, expected) {
    const before = await state();
    const r = await undo(id);
    assert.equal(r.code, "UNDO_UNSAFE", JSON.stringify(r));
    assert.deepEqual(
      r.details.blockers.map((b) => b.commandId).sort(),
      expected.toSorted(),
    );
    assert.deepEqual(await state(), before);
    return r;
  }
  async function consistent(label) {
    const snapshot = await engine.load("ravenford");
    assert.deepEqual(replay(snapshot.history), snapshot.state);
    assert.deepEqual(checkWorldIntegrity(snapshot.state), []);
    const port = skillCheckPort(scriptedDice([]));
    assert.equal(
      redecideEffective(
        await engine.commandLog("ravenford"),
        snapshot,
        port.skillModifier.bind(port),
      ),
      null,
      label,
    );
  }
  async function guest(id) {
    accepted(
      await post({
        type: "CreateEntity",
        entityId: id,
        kind: "character",
        name: id,
        existsSince: null,
        placement: { locationId: "north-gate", since: null },
      }),
    );
    return accepted(
      await post({
        type: "AssignCharacter",
        characterId: id,
        playerActorId: "outsider",
      }),
    );
  }
  try {
    // Every player-command family, including perceived movement and an empty inspection.
    const actions = [
      [
        "public-move",
        (id) => ({
          type: "EnterLocation",
          characterId: id,
          locationId: "market-square",
        }),
      ],
      [
        "perceived-move",
        (id) => ({
          type: "EnterLocation",
          characterId: id,
          locationId: "ravenford",
        }),
      ],
      [
        "examine",
        (id) => ({
          type: "ExamineEntity",
          characterId: id,
          entityId: "north-gate",
          method: "inspect",
        }),
      ],
      [
        "ask",
        (id) => ({
          type: "AskAbout",
          characterId: id,
          npcId: "captain-thorne",
          topicId: "guild-caravan",
        }),
      ],
      [
        "hypothesis",
        (id) => ({
          type: "FormHypothesis",
          characterId: id,
          scope: "CHARACTER",
          statement: "Private hypothesis",
          subjects: [],
        }),
      ],
    ];
    for (const [label, action] of actions) {
      const id = `guest-${label}`,
        assignment = await guest(id);
      const r = await post(action(id), "outsider");
      const acted = accepted(r);
      assert.deepEqual(r.events, []);
      assert.ok(
        !/controller|PremisesRecorded|playerActorId/.test(JSON.stringify(r)),
      );
      await reload();
      const rejection = await blocked(assignment, [acted]);
      const h = (await engine.load("ravenford")).history;
      assert.equal(
        h.filter(
          (e) =>
            e.causation.commandId === acted &&
            e.type === "PremisesRecorded" &&
            e.payload.premises.some(
              (p) => p.kind === "controller" && p.playerActorId === "outsider",
            ),
        ).length,
        1,
      );
      accepted(await undo(acted));
      accepted(await undo(assignment));
      await consistent(label);
      results.push({
        mode,
        case: `all-commands-${label}`,
        assignmentUndo: rejection.code,
        exactBlocker: acted,
        reverseUndo: "accepted",
        playerMetadataAbsent: true,
      });
    }
    // Privileged authority does not acquire a spurious controlling-player dependency.
    for (const who of ["dm", "system"])
      for (const kind of ["move", "hypothesis"]) {
        const id = `guest-${who}-${kind}`,
          assignment = await guest(id);
        const action =
          kind === "move"
            ? {
                type: "EnterLocation",
                characterId: id,
                locationId: "market-square",
              }
            : {
                type: "FormHypothesis",
                characterId: id,
                scope: "CHARACTER",
                statement: "An authorized guess",
                subjects: [],
              };
        let r;
        if (who === "system") {
          internalCommands++;
          r = await engine.execute({
            campaignId: "ravenford",
            commandId: `system-${kind}`,
            actor: { kind: "system", actorId: "review-system" },
            command: action,
          });
        } else r = await post(action);
        const acted = accepted(r);
        accepted(await undo(assignment));
        const snapshot = await engine.load("ravenford");
        assert.equal(snapshot.state.commands.get(acted).undoneBy, null);
        assert.ok(
          snapshot.history
            .filter(
              (e) =>
                e.causation.commandId === acted &&
                e.type === "PremisesRecorded",
            )
            .every((e) =>
              e.payload.premises.every((p) => p.kind !== "controller"),
            ),
        );
        await consistent(`${who}-${kind}`);
        accepted(await undo(acted));
        results.push({
          mode,
          case: `authority-${who}-${kind}`,
          assignmentUndo: "accepted",
          actionStayedEffective: true,
          noControllerPremise: true,
        });
      }
    // Multiple read-only commands remain independent, but each holds the changed clock.
    const advanced = accepted(
      await post({ type: "AdvanceWorldTime", to: 36100 }),
    );
    const inspect = {
      type: "ExamineEntity",
      characterId: E,
      entityId: "market-square",
      method: "inspect",
    };
    const first = accepted(await post(inspect, "player"));
    const second = accepted(await post(inspect, "player"));
    await blocked(advanced, [first, second]);
    accepted(await undo(first));
    await blocked(advanced, [second]);
    accepted(await undo(second));
    accepted(await undo(advanced));
    await reload();
    assert.equal((await state()).clock, 36000);
    await consistent("read-only-command-order");
    results.push({
      mode,
      case: "multiple-read-only-commands",
      bothInitiallyBlockClock: true,
      firstUndoDoesNotEraseSecond: true,
      clockRecovered: 36000,
    });

    // Retry, undo and redetect a contradiction. The old identity stays reserved.
    for (const id of ["account-a", "account-b"])
      accepted(
        await post({
          type: "AddKnowledge",
          knowledgeId: id,
          scope: { kind: "PUBLIC" },
          knowledgeType: "HYPOTHESIS",
          statement: "An account.",
          subjects: ["guild-caravan"],
          knownSince: 36000,
        }),
      );
    const setClaim = (id, value) => ({
      type: "SetClaim",
      target: { kind: "knowledge", knowledgeId: id },
      claim: { subjectId: "guild-caravan", aspect: "review-route", value },
    });
    const claimA = accepted(await post(setClaim("account-a", "east")));
    const otherClaim = setClaim("account-b", "west");
    const caused = await post(otherClaim, "dm", "contradiction-original");
    accepted(caused);
    const snapshot1 = await engine.load("ravenford");
    const contradiction1 = [...snapshot1.state.knowledge.values()].find(
      (k) =>
        k.knowledgeType === "CONTRADICTION" &&
        k.relations.some((r) => r.knowledgeId === "account-b"),
    );
    assert.ok(contradiction1);
    assert.equal(contradiction1.scope.kind, "PUBLIC");
    assert.ok(
      !/east|west|review-route|liar|lying/.test(contradiction1.statement),
    );
    const dup = await post(otherClaim, "dm", "contradiction-original");
    assert.equal(dup.status, "duplicate");
    assert.equal((await state()).version, snapshot1.state.version);
    await blocked(claimA, [caused.commandId]);
    accepted(await undo(caused.commandId));
    assert.equal(
      (await state()).knowledge.has(contradiction1.knowledgeId),
      false,
    );
    assert.ok((await state()).usedIds.has(contradiction1.knowledgeId));
    await reload();
    const secondClaim = accepted(
      await post(otherClaim, "dm", "contradiction-redetect"),
    );
    const snapshot2 = await engine.load("ravenford");
    const contradiction2 = [...snapshot2.state.knowledge.values()].find(
      (k) =>
        k.knowledgeType === "CONTRADICTION" &&
        k.relations.some((r) => r.knowledgeId === "account-b"),
    );
    assert.ok(contradiction2);
    assert.notEqual(contradiction2.knowledgeId, contradiction1.knowledgeId);
    assert.equal(contradiction2.statement, contradiction1.statement);
    assert.deepEqual(contradiction2.relations, contradiction1.relations);
    assert.equal(
      snapshot2.state.knowledge.get("account-a").knowledgeType,
      "HYPOTHESIS",
    );
    assert.equal(
      snapshot2.state.knowledge.get("account-b").knowledgeType,
      "HYPOTHESIS",
    );
    await consistent("contradiction-redetection");
    accepted(await undo(secondClaim));
    accepted(await undo(claimA));
    await reload();
    await consistent("contradiction-recovery");
    results.push({
      mode,
      case: "contradiction-identity",
      originalId: contradiction1.knowledgeId,
      newId: contradiction2.knowledgeId,
      retry: "duplicate",
      oldIdReserved: true,
      neutralContentUnchanged: true,
      typesUnchanged: true,
    });

    // Race a player action against undo of its assignment; PostgreSQL uses two engines.
    const raceSummary = [];
    for (let round = 0; round < 8; round++) {
      const id = `guest-race-${round}`,
        assignment = await guest(id);
      const rival = restart ? await ravenfordApp(restart()) : app;
      try {
        const move = {
          type: "EnterLocation",
          characterId: id,
          locationId: "market-square",
        };
        const tasks =
          round % 2 === 0
            ? [
                () => post(move, "outsider", `race-move-${round}`, rival),
                () => undo(assignment, `race-undo-${round}`),
              ]
            : [
                () => undo(assignment, `race-undo-${round}`),
                () => post(move, "outsider", `race-move-${round}`, rival),
              ];
        const responses = await Promise.all(tasks.map((f) => f()));
        const [moved, undone] =
          round % 2 === 0 ? responses : [responses[1], responses[0]];
        assert.ok(
          !(moved.status === "accepted" && undone.status === "accepted"),
          JSON.stringify(responses),
        );
        await reload();
        const snap = await state();
        if (moved.status === "accepted") {
          assert.equal(undone.code, "UNDO_UNSAFE");
          assert.ok(snap.roster.has(id));
          accepted(await undo(moved.commandId));
          accepted(await undo(assignment));
        } else {
          assert.equal(undone.status, "accepted");
          assert.ok(moved.http === 403 || moved.http === 404);
          assert.equal(snap.roster.has(id), false);
          assert.equal(
            snap.entities.get(id).placement.locationId,
            "north-gate",
          );
        }
        raceSummary.push({
          round,
          move: moved.status ?? moved.error?.code,
          undo: undone.status,
          undoCode: undone.code ?? null,
        });
      } finally {
        if (rival !== app) await rival.close();
      }
    }
    await reload();
    await consistent("after-races");
    results.push({
      mode,
      case: "concurrent-assignment-undo",
      rounds: raceSummary,
      invalidDoubleAcceptance: 0,
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
const summary = {
  requests,
  internalCommands,
  results,
  temporaryDatabaseDropped: true,
};
await writeFile(
  "/tmp/astra-gate-02-retest2-extended-results.json",
  JSON.stringify(summary, null, 2) + "\n",
);
console.log(JSON.stringify(summary, null, 2));
ASTRA_PROBE
node --conditions=@ltw/source /tmp/astra-gate-02-retest2-extended.mjs
```
