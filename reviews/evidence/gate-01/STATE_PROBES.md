# Gate 01 — State, cache, and persistence probes

Frozen independent reviewer evidence for code revision `641c6af1e9651147107f4c9c3113535e36026520`, run on 2026-10-03. Start with `../../ASTRA_GATE_01_REPORT.md`.

Requires PostgreSQL from `pnpm db:up` and installed dependencies. Uses the application test interfaces and fixture tokens. Mutations run in a fresh in-memory campaign and a newly created throwaway PostgreSQL database, dropped in `finally`. Does not modify the seeded development campaign.

Run from the repository root after installing/building as described in the handoff. Nonzero exit means a failed assertion or harness/setup error. The recipe prints its summary and writes `/tmp/astra-gate-01-state-results.json`. Assertions are grouped; request counts are not independent test-case counts.

```bash
node --conditions=@ltw/source --input-type=module <<'ASTRA_GATE_01_PROBE'
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const root = process.cwd();
const imp = (p) => import(pathToFileURL(`${root}/${p}`));
const { ravenfordApp, seededEngine, TOKENS } = await imp(
  "apps/server/src/testing/ravenford-app.ts",
);
const { createThrowawayDatabase } = await imp(
  "apps/server/src/testing/throwaway-database.ts",
);
const { PostgresEventStore } = await imp(
  "apps/server/src/world-engine/postgres-event-store.ts",
);
const { createWorldEngine } = await imp(
  "apps/server/src/world-engine/runtime.ts",
);
const { buildApp } = await imp("apps/server/src/http/app.ts");
const { loadDevPersonaAuthenticator, disabledAuthenticator } = await imp(
  "apps/server/src/http/auth.ts",
);
const { DEFAULT_PERSONAS_FILE } = await imp(
  "apps/server/src/platform/config/config.ts",
);
const { createLogger } = await imp(
  "apps/server/src/platform/logging/logger.ts",
);
const pg = createRequire(`${root}/apps/server/package.json`)("pg");
const failures = [],
  checks = {};
let requests = 0;
function check(group, label, f) {
  checks[group] = (checks[group] ?? 0) + 1;
  try {
    f();
  } catch (e) {
    failures.push({ group, label, message: e.message });
  }
}
async function req(app, path, who = "dm", body, extraHeaders = {}) {
  requests++;
  const r = await app.inject({
    method: body === undefined ? "GET" : "POST",
    url: "/campaigns/ravenford" + path,
    headers: {
      authorization: `Bearer ${TOKENS[who]}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...extraHeaders,
    },
    ...(body === undefined
      ? {}
      : { payload: typeof body === "string" ? body : JSON.stringify(body) }),
  });
  return { status: r.statusCode, body: r.json(), text: r.body };
}
const post = (a, id, command, who = "dm", extra = {}) =>
  req(a, "/commands", who, { commandId: id, command, ...extra });
const list = (a, p, who = "dm", suffix = "") =>
  req(a, `/knowledge?perspective=${encodeURIComponent(p)}${suffix}`, who);
const accepted = (r) =>
  assert.equal(r.body.status, "accepted", JSON.stringify(r.body));
const add = (id, scope, extra = {}) => ({
  type: "AddKnowledge",
  knowledgeId: id,
  scope,
  knowledgeType: "SECRET",
  statement: `ASTRA_CANARY_${id}`,
  knownSince: 36000,
  ...extra,
});
const scopeRows = [
  ["w", { kind: "WORLD_TRUTH" }],
  ["d", { kind: "DM" }],
  ["u", { kind: "PUBLIC" }],
  ["p", { kind: "PARTY" }],
  ["c", { kind: "CHARACTER", characterId: "elowen-starwhisper" }],
  ["m", { kind: "NPC", npcId: "mira-vale" }],
  ["o", { kind: "NPC", npcId: "orin-stonebeard" }],
  ["x", { kind: "CHARACTER", characterId: "astra-other" }],
];
const expected = {
  DM: "wdupcmox",
  PUBLIC: "u",
  PARTY: "up",
  PLAYER: "upc",
  "CHARACTER:elowen-starwhisper": "upc",
  "CHARACTER:astra-other": "ux",
  "NPC:mira-vale": "um",
  "NPC:orin-stonebeard": "uo",
  "NPC:captain-thorne": "u",
};
async function scenario(mode, engine, restart) {
  const apps = [];
  try {
    let app = await ravenfordApp(engine);
    apps.push(app);
    const before = (await engine.load("ravenford")).state.version;
    const denialCommands = [
      add("bad", { kind: "WORLD_TRUTH" }),
      { type: "UndoCommand", targetCommandId: "ravenford.knowledge.0030" },
      { type: "UndoCommand", targetCommandId: "never-existed" },
      {
        type: "AssignCharacter",
        characterId: "elowen-starwhisper",
        playerActorId: "outsider",
      },
      {
        type: "UpdateEntityProfile",
        entityId: "3f9c2b7e-5a1d-4e8f-9b06-7c4d2e1a8f53",
        name: "leak",
      },
      { type: "ChangeEntityStatus", entityId: "not-real", status: "dead" },
      { type: "AdvanceWorldTime", by: 1 },
    ];
    for (const [i, command] of denialCommands.entries()) {
      const r = await post(app, `denied-${i}`, command, "player", {
        expectedVersion: 0,
      });
      check("player-authority", mode + ":" + command.type, () =>
        assert.equal(r.status, 403),
      );
    }
    const malformed = [
      {
        commandId: "bad-actor",
        command: add("bad", { kind: "PUBLIC" }),
        actor: { kind: "system", actorId: "dm-ravenford" },
      },
      {
        commandId: "bad-campaign",
        command: add("bad", { kind: "PUBLIC" }),
        campaignId: "ravenford",
      },
      {
        commandId: "bad-scope",
        command: add("bad", { kind: "WORLD_TRUTH", npcId: "mira-vale" }),
      },
      {
        commandId: "bad-extra",
        command: {
          ...add("bad", { kind: "PUBLIC" }),
          actor: { kind: "system" },
        },
      },
      '{"commandId":"poison","command":{"type":"AddKnowledge"},"__proto__":{"kind":"system"}}',
      '{"commandId":',
      {
        commandId: "big",
        command: add(
          "bad",
          { kind: "PUBLIC" },
          { statement: "X".repeat(70000) },
        ),
      },
    ];
    for (const body of malformed) {
      const r = await req(app, "/commands", "player", body);
      check("malformed-command", mode, () => assert.equal(r.status, 400));
    }
    const unchanged = (await engine.load("ravenford")).state.version;
    check("rejected-atomicity", mode, () => assert.equal(unchanged, before));
    const character = await post(app, "other", {
      type: "CreateEntity",
      entityId: "astra-other",
      kind: "character",
      name: "Other character",
      description: "ASTRA_PRIVATE_DESCRIPTION",
      existsSince: null,
    });
    check("authoring", mode, () => accepted(character));
    for (const [id, scope] of scopeRows) {
      const r = await post(
        app,
        "canary-" + id,
        add("canary-" + id, scope, {
          subjects: id === "x" ? ["astra-other"] : [],
        }),
      );
      check("authoring", mode + ":" + id, () => accepted(r));
    }
    for (const [p, allowed] of Object.entries(expected)) {
      const r = await list(app, p, p === "PLAYER" ? "player" : "dm");
      check("canary-scopes", mode + ":" + p, () => {
        assert.equal(r.status, 200);
        for (const [id] of scopeRows)
          assert.equal(
            r.text.includes(`ASTRA_CANARY_canary-${id}`),
            allowed.includes(id),
          );
        assert.ok(!r.text.includes("ASTRA_PRIVATE_DESCRIPTION"));
      });
      const past = await list(
        app,
        p,
        p === "PLAYER" ? "player" : "dm",
        "&asOf=35999",
      );
      check("canary-as-of", mode + ":" + p, () =>
        assert.ok(!past.text.includes("ASTRA_CANARY_")),
      );
    }
    const hiddenEntity = await post(app, "secret-entity", {
      type: "CreateEntity",
      entityId: "astra-hidden",
      kind: "faction",
      name: "ASTRA_HIDDEN_ENTITY_NAME",
      description: "ASTRA_HIDDEN_ENTITY_DESCRIPTION",
      existsSince: null,
    });
    check("authoring", mode, () => accepted(hiddenEntity));
    accepted(
      await post(
        app,
        "secret-record",
        add(
          "astra-secret",
          { kind: "WORLD_TRUTH" },
          { subjects: ["astra-hidden"] },
        ),
      ),
    );
    accepted(
      await post(
        app,
        "public-edge",
        add(
          "astra-public-edge",
          { kind: "PUBLIC" },
          {
            relations: [{ type: "DERIVED_FROM", knowledgeId: "astra-secret" }],
          },
        ),
      ),
    );
    accepted(
      await post(
        app,
        "private-bridge",
        add(
          "astra-bridge",
          { kind: "NPC", npcId: "orin-stonebeard" },
          {
            relations: [
              { type: "REFERS_TO", knowledgeId: "astra-public-edge" },
              { type: "REFERS_TO", knowledgeId: "canary-m" },
            ],
          },
        ),
      ),
    );
    for (const p of [
      "PUBLIC",
      "PARTY",
      "PLAYER",
      "NPC:mira-vale",
      "NPC:captain-thorne",
    ]) {
      const who = p === "PLAYER" ? "player" : "dm";
      for (const url of [
        `/knowledge/astra-public-edge/related?perspective=${p}&depth=3`,
        `/entities?perspective=${p}`,
        `/knowledge?perspective=${p}&about=astra-hidden`,
      ]) {
        const r = await req(app, url, who);
        check("hidden-bridge", mode + ":" + p, () => {
          assert.equal(r.status, 200);
          for (const marker of [
            "astra-secret",
            "ASTRA_HIDDEN_ENTITY",
            "astra-bridge",
          ])
            assert.ok(!r.text.includes(marker));
        });
      }
    }
    const unsafe = await post(app, "unsafe-undo", {
      type: "UndoCommand",
      targetCommandId: "http:dm-ravenford:secret-record",
    });
    check("undo-dependency", mode, () =>
      assert.equal(unsafe.body.code, "UNDO_UNSAFE"),
    );
    accepted(
      await post(app, "undo-bridge", {
        type: "UndoCommand",
        targetCommandId: "http:dm-ravenford:private-bridge",
      }),
    );
    accepted(
      await post(app, "undo-edge", {
        type: "UndoCommand",
        targetCommandId: "http:dm-ravenford:public-edge",
      }),
    );
    accepted(
      await post(app, "undo-record", {
        type: "UndoCommand",
        targetCommandId: "http:dm-ravenford:secret-record",
      }),
    );
    accepted(
      await post(app, "undo-entity", {
        type: "UndoCommand",
        targetCommandId: "http:dm-ravenford:secret-entity",
      }),
    );
    const afterUndo = await list(app, "DM");
    check("undo-removal", mode, () => {
      for (const marker of [
        "astra-secret",
        "astra-public-edge",
        "astra-bridge",
      ])
        assert.ok(!afterUndo.text.includes(marker));
    });
    const duplicate = await post(
      app,
      "canary-w",
      add("canary-w", { kind: "WORLD_TRUTH" }, { subjects: [] }),
    );
    check("idempotency", mode, () =>
      assert.equal(duplicate.body.status, "duplicate"),
    );
    const conflict = await post(
      app,
      "canary-w",
      add("canary-w", { kind: "WORLD_TRUTH" }, { statement: "different" }),
    );
    check("idempotency", mode, () =>
      assert.equal(conflict.body.code, "COMMAND_ID_CONFLICT"),
    );
    const playerProbe = await post(
      app,
      "canary-w",
      add("canary-w", { kind: "WORLD_TRUTH" }),
      "player",
    );
    check("idempotency-actor-isolation", mode, () =>
      assert.equal(playerProbe.status, 403),
    );
    const baseline = [];
    for (const p of Object.keys(expected))
      baseline.push(
        (await list(app, p, p === "PLAYER" ? "player" : "dm")).body,
      );
    if (restart) {
      const second = await restart();
      app = await ravenfordApp(second);
      apps.push(app);
      for (const [i, p] of Object.keys(expected).entries()) {
        const r = await list(app, p, p === "PLAYER" ? "player" : "dm");
        check("restart-equality", p, () =>
          assert.deepEqual(r.body, baseline[i]),
        );
      }
      // Warm the second engine's cache, then write through the first engine.
      const r = await post(
        apps[0],
        "post-restart",
        add("post-restart", { kind: "DM" }),
      );
      accepted(r);
      const fresh = await list(app, "DM");
      const player = await list(app, "PLAYER", "player");
      check("cross-engine-catchup", mode, () => {
        assert.ok(fresh.text.includes("ASTRA_CANARY_post-restart"));
        assert.ok(!player.text.includes("ASTRA_CANARY_post-restart"));
      });
    }
    // The first engine may hold a cached player projection's canonical input.
    const commands = await engine.commandLog("ravenford");
    const assignment = commands.find(
      (c) =>
        c.commandType === "AssignCharacter" &&
        c.command.characterId === "elowen-starwhisper",
    );
    accepted(
      await post(app, "unassign-elowen", {
        type: "UndoCommand",
        targetCommandId: assignment.commandId,
      }),
    );
    const revoked = await list(apps[0], "PLAYER", "player");
    check("roster-cache-revocation", mode, () =>
      assert.equal(revoked.status, 404),
    );
    accepted(
      await post(app, "assign-other", {
        type: "AssignCharacter",
        characterId: "astra-other",
        playerActorId: "player-elowen",
      }),
    );
    const switched = await list(apps[0], "PLAYER", "player");
    check("roster-cache-reassignment", mode, () => {
      assert.equal(switched.body.perspective, "CHARACTER:astra-other");
      assert.ok(switched.text.includes("ASTRA_CANARY_canary-x"));
      assert.ok(!switched.text.includes("ASTRA_CANARY_canary-c"));
      assert.ok(!switched.text.includes("elowen-sigil-lore"));
      assert.ok(switched.text.includes("ASTRA_CANARY_canary-p"));
    });
    const forged = await list(app, "CHARACTER:elowen-starwhisper", "player");
    check("roster-former-character", mode, () =>
      assert.equal(forged.status, 403),
    );
    return baseline.map((b) => ({
      ...b,
      knowledge: b.knowledge.map(({ origin, ...rest }) => rest),
    }));
  } finally {
    for (const app of apps) await app.close();
  }
}
const memory = await scenario("memory", await seededEngine());
const database = await createThrowawayDatabase({ migrate: true });
const pool = new pg.Pool({ connectionString: database.url });
try {
  const persistent = await scenario(
    "postgres",
    await seededEngine(new PostgresEventStore(pool)),
    async () => createWorldEngine(pool),
  );
  check("store-equality", "memory vs postgres", () =>
    assert.deepEqual(persistent, memory),
  );
} finally {
  await pool.end();
  await database.drop();
}
const logger = createLogger({ service: "astra-review", level: "silent" });
const authenticator = await loadDevPersonaAuthenticator(DEFAULT_PERSONAS_FILE);
const broken = buildApp({
  engine: {
    load: async () => {
      throw new Error("ASTRA_INTERNAL_SECRET");
    },
  },
  authenticator,
  logger,
});
try {
  const r = await list(broken, "PLAYER", "player");
  check("internal-error", "canary", () => {
    assert.equal(r.status, 500);
    assert.ok(!r.text.includes("ASTRA_INTERNAL_SECRET"));
    assert.deepEqual(r.body.error, {
      code: "INTERNAL",
      message: "Internal error",
    });
  });
} finally {
  await broken.close();
}
const disabled = buildApp({
  engine: await seededEngine(),
  authenticator: disabledAuthenticator,
  logger,
});
try {
  const r = await list(disabled, "DM");
  check("disabled-authentication", "DM token", () =>
    assert.equal(r.status, 401),
  );
} finally {
  await disabled.close();
}
const summary = { requests, checks, failures, temporaryDatabaseDropped: true };
await writeFile(
  "/tmp/astra-gate-01-state-results.json",
  JSON.stringify(summary, null, 2) + "\n",
);
console.log(JSON.stringify(summary, null, 2));
process.exitCode = failures.length ? 1 : 0;
ASTRA_GATE_01_PROBE
```
