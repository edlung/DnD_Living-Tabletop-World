# Gate 01 — Live HTTP probes

Frozen independent reviewer evidence for code revision `641c6af1e9651147107f4c9c3113535e36026520`, run on 2026-10-03. Start with `../../ASTRA_GATE_01_REPORT.md`.

Requires the seeded development server at `127.0.0.1:3000`, exactly as in the handoff. Uses fixture tokens. Performs reads and player commands expected to be rejected; it does not submit authorized DM writes. The expected fixture has 30 records and world time 36000.

Run from the repository root after installing/building as described in the handoff. Nonzero exit means a failed assertion or harness/setup error. The recipe prints its summary and writes `/tmp/astra-gate-01-live-results.json`. Assertions are grouped; request counts are not independent test-case counts.

```bash
node --input-type=module <<'ASTRA_GATE_01_PROBE'
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
const root = process.cwd();
const json = async (p) => JSON.parse(await readFile(`${root}/${p}`, "utf8"));
const spec = await json("fixtures/ravenford/knowledge-boundary.json");
const seed = await json("fixtures/ravenford/knowledge-seed.json");
const records = seed.commands.filter((c) => c.type === "AddKnowledge");
const token = {
  dm: "dev-dm-ravenford",
  player: "dev-player-elowen",
  outsider: "dev-outsider",
};
const base = "http://127.0.0.1:3000";
const path = "/campaigns/ravenford";
const checks = {},
  failures = [],
  anomalies = [];
let requests = 0;
function check(group, label, f) {
  checks[group] = (checks[group] ?? 0) + 1;
  try {
    f();
  } catch (e) {
    failures.push({ group, label, message: e.message });
  }
}
async function req(url, who = "player", options = {}) {
  const headers = {
    ...(who ? { authorization: `Bearer ${token[who]}` } : {}),
    ...options.headers,
  };
  const res = await fetch(base + url, { ...options, headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  requests++;
  check("response-headers", url, () => {
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.headers.get("vary"), "Authorization");
    assert.ok(res.headers.get("x-request-id"));
  });
  return { status: res.status, body, text };
}
function clean(r) {
  const { requestId, ...rest } = r.body;
  return { status: r.status, ...rest };
}
function safe(r, perspective) {
  if (r.status !== 200) return;
  const p =
    perspective === "PLAYER" ? "CHARACTER:elowen-starwhisper" : perspective;
  for (const marker of spec.forbiddenMarkers[p] ?? [])
    check("marker-scan", p + ":" + marker, () =>
      assert.ok(!r.text.includes(marker)),
    );
  if (p !== "DM")
    check("projection-whitelist", p, () => {
      const views = Array.isArray(r.body.knowledge)
        ? r.body.knowledge
        : r.body.knowledge
          ? [r.body.knowledge]
          : (r.body.nodes ?? []);
      for (const v of views) {
        assert.deepEqual(
          Object.keys(v).sort(),
          [
            "knowledgeId",
            "knowledgeType",
            "scope",
            "statement",
            "subjects",
            "attributedTo",
            "relations",
            "knownSince",
          ].sort(),
        );
        for (const e of [
          ...v.subjects,
          ...(v.attributedTo ? [v.attributedTo] : []),
        ])
          assert.deepEqual(Object.keys(e).sort(), ["entityId", "kind", "name"]);
      }
      for (const e of [
        ...(r.body.entities ?? []),
        ...(r.body.relatedEntities ?? []),
        ...(r.body.entity ? [r.body.entity] : []),
      ])
        assert.deepEqual(Object.keys(e).sort(), ["entityId", "kind", "name"]);
    });
}
const dm = await req(path + "/knowledge?perspective=DM", "dm");
const entities = (await req(path + "/entities?perspective=DM", "dm")).body
  .entities;
check("positive-controls", "DM records/provenance", () => {
  assert.equal(dm.body.knowledge.length, 30);
  assert.ok(dm.body.knowledge.every((r) => r.origin));
  assert.ok(dm.text.includes("Ashen Circle"));
});
for (const p of [
  "DM",
  "PUBLIC",
  "PARTY",
  "PLAYER",
  "CHARACTER:elowen-starwhisper",
  "NPC:mira-vale",
  "NPC:orin-stonebeard",
  "NPC:captain-thorne",
]) {
  const who = p === "DM" || p.startsWith("NPC:") ? "dm" : "player";
  const label = p === "PLAYER" ? "CHARACTER:elowen-starwhisper" : p;
  const q = `perspective=${encodeURIComponent(p)}`;
  const visible =
    p === "DM" ? records.map((r) => r.knowledgeId) : spec.visible[label];
  const list = await req(`${path}/knowledge?${q}`, who);
  safe(list, p);
  check("visible-sets", p, () =>
    assert.deepEqual(
      list.body.knowledge.map((r) => r.knowledgeId),
      visible,
    ),
  );
  for (const id of [...records.map((r) => r.knowledgeId), "no-such-record"]) {
    const r = await req(`${path}/knowledge/${id}?${q}`, who);
    safe(r, p);
    check("direct-records", p + ":" + id, () =>
      assert.equal(r.status, visible.includes(id) ? 200 : 404),
    );
    for (const depth of [1, 2, 3]) {
      const graph = await req(
        `${path}/knowledge/${id}/related?${q}&depth=${depth}`,
        who,
      );
      safe(graph, p);
      check("graph", p + ":" + id + ":" + depth, () => {
        assert.equal(graph.status, visible.includes(id) ? 200 : 404);
        if (graph.status === 200) {
          for (const n of graph.body.nodes) {
            assert.ok(visible.includes(n.knowledgeId));
            for (const edge of n.relations)
              assert.ok(visible.includes(edge.knowledgeId));
          }
          for (const e of graph.body.edges)
            assert.ok(visible.includes(e.from) && visible.includes(e.to));
        }
      });
    }
  }
  const known = await req(`${path}/entities?${q}`, who);
  safe(known, p);
  for (const e of [...entities, { entityId: "no-such-entity" }]) {
    const r = await req(`${path}/entities/${e.entityId}/knowledge?${q}`, who);
    safe(r, p);
    check("entity-traversal", p + ":" + e.entityId, () =>
      assert.equal(
        r.status,
        known.body.entities.some((k) => k.entityId === e.entityId) ? 200 : 404,
      ),
    );
    const filtered = await req(
      `${path}/knowledge?${q}&about=${e.entityId}`,
      who,
    );
    safe(filtered, p);
    check("subject-filter", p + ":" + e.entityId, () =>
      assert.deepEqual(
        filtered.body.knowledge.map((r) => r.knowledgeId),
        records
          .filter(
            (r) =>
              visible.includes(r.knowledgeId) &&
              r.subjects?.includes(e.entityId),
          )
          .map((r) => r.knowledgeId),
      ),
    );
  }
  for (const type of [
    "FACT",
    "EVIDENCE",
    "TESTIMONY",
    "RUMOR",
    "INFERENCE",
    "HYPOTHESIS",
    "CONTRADICTION",
    "UNKNOWN",
    "SECRET",
  ]) {
    const r = await req(`${path}/knowledge?${q}&type=${type}`, who);
    safe(r, p);
    check("type-filter", p + ":" + type, () =>
      assert.deepEqual(
        r.body.knowledge.map((r) => r.knowledgeId),
        records
          .filter(
            (r) => visible.includes(r.knowledgeId) && r.knowledgeType === type,
          )
          .map((r) => r.knowledgeId),
      ),
    );
  }
  for (const t of [
    -1000000000000, -259201, -259200, -154800, 0, 21599, 21600, 34199, 34200,
    35099, 35100, 36000, 36001, 1000000000000,
  ]) {
    const r = await req(`${path}/knowledge?${q}&asOf=${t}`, who);
    safe(r, p);
    check("as-of", p + ":" + t, () => {
      assert.equal(r.status, t > 36000 ? 400 : 200);
      if (r.status === 200) {
        const expected = records
          .filter(
            (r) =>
              visible.includes(r.knowledgeId) &&
              (r.knownSince === null || r.knownSince <= t),
          )
          .map((r) => r.knowledgeId);
        assert.deepEqual(
          r.body.knowledge.map((r) => r.knowledgeId),
          expected,
        );
        for (const record of r.body.knowledge)
          for (const rel of record.relations)
            assert.ok(expected.includes(rel.knowledgeId));
      }
    });
  }
  if (p !== "DM") {
    const missing = clean(
      await req(`${path}/knowledge/no-such-record?${q}`, who),
    );
    for (const id of records
      .map((r) => r.knowledgeId)
      .filter((id) => !visible.includes(id))) {
      const hidden = clean(await req(`${path}/knowledge/${id}?${q}`, who));
      check("uniform-absence", p + ":" + id, () =>
        assert.deepEqual(hidden, missing),
      );
    }
  }
}
const malformed = [
  "",
  "perspective=",
  "perspective=dm",
  "perspective=WORLD_TRUTH",
  "perspective=PARTY&perspective=DM",
  "perspective=DM&perspective=PARTY",
  "perspective=PARTY&perspective=PARTY",
  "perspective%5B%5D=PARTY",
  "perspective%5Bkind%5D=DM",
  "perspective=PARTY%2CDM",
  "perspective=PARTY%00",
  "perspective=PARTY&scope=DM",
  "perspective=CHARACTER:",
  "perspective=NPC:",
  "perspective=PARTY&asOf=NaN",
  "perspective=PARTY&asOf=Infinity",
  "perspective=PARTY&asOf=1e3",
  "perspective=PARTY&asOf=0&asOf=1",
  "perspective=PARTY&about=__proto__",
  "perspective=PARTY&type=SECRET&type=FACT",
];
for (const q of malformed) {
  const r = await req(`${path}/knowledge?${q}`);
  safe(r, "PLAYER");
  check("malformed-scopes", q, () => assert.equal(r.status, 400));
}
for (const p of [
  "DM",
  "NPC:mira-vale",
  "NPC:orin-stonebeard",
  "NPC:no-such",
  "CHARACTER:no-such",
  "CHARACTER:orin-stonebeard",
]) {
  const r = await req(`${path}/knowledge?perspective=${p}`);
  check("forged-perspectives", p, () => assert.equal(r.status, 403));
}
for (const who of [null, "outsider"])
  for (const campaign of ["ravenford", "no-such-campaign"])
    for (const p of ["DM", "PUBLIC", "PARTY", "PLAYER", "NPC:mira-vale"]) {
      const r = await req(
        `/campaigns/${campaign}/knowledge?perspective=${p}`,
        who,
      );
      check("authentication-membership", `${who}:${campaign}:${p}`, () =>
        assert.equal(r.status, who ? 404 : 401),
      );
    }
await Promise.all(
  Array.from({ length: 96 }, async (_, i) => {
    const p = ["DM", "PLAYER", "NPC:mira-vale", "PUBLIC"][i % 4];
    const r = await req(
      `${path}/knowledge?perspective=${p}`,
      p === "DM" || p.startsWith("NPC:") ? "dm" : "player",
    );
    safe(r, p);
    check("concurrent-reads", p, () =>
      assert.deepEqual(
        r.body.knowledge.map((r) => r.knowledgeId),
        p === "DM"
          ? records.map((r) => r.knowledgeId)
          : spec.visible[p === "PLAYER" ? "CHARACTER:elowen-starwhisper" : p],
      ),
    );
  }),
);
const command = {
  type: "AddKnowledge",
  knowledgeId: "astra-player-probe",
  scope: { kind: "WORLD_TRUTH" },
  knowledgeType: "SECRET",
  statement: "forbidden mutation",
  knownSince: null,
};
for (const subject of [
  "3f9c2b7e-5a1d-4e8f-9b06-7c4d2e1a8f53",
  "no-such-entity",
])
  for (const expectedVersion of [0, 64, 65]) {
    const r = await req(path + "/commands", "player", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        commandId: `probe-${subject.slice(0, 8)}-${expectedVersion}`,
        command: { ...command, subjects: [subject] },
        expectedVersion,
      }),
    });
    check("command-denial", "state oracle", () =>
      assert.deepEqual(clean(r), {
        status: 403,
        error: { code: "FORBIDDEN", message: "Not permitted" },
      }),
    );
  }
const after = await req(path + "/knowledge?perspective=DM", "dm");
check("command-denial", "no writes", () =>
  assert.deepEqual(after.body, dm.body),
);
for (const q of [
  "perspective=CHARACTER:elowen-starwhisper%0A",
  "perspective=NPC:mira-vale%0A",
  "perspective=PARTY&__proto__=DM",
  "perspective=PARTY&constructor=DM",
  "perspective=PARTY&asOf=0%0A",
]) {
  const r = await req(
    `${path}/knowledge?${q}`,
    q.includes("NPC:") ? "dm" : "player",
  );
  if (r.status !== 400)
    anomalies.push({
      query: q,
      status: r.status,
      perspective: r.body.perspective,
    });
}
const summary = { requests, checks, failures, anomalies };
await writeFile(
  "/tmp/astra-gate-01-live-results.json",
  JSON.stringify(summary, null, 2) + "\n",
);
console.log(JSON.stringify(summary, null, 2));
process.exitCode = failures.length ? 1 : 0;
ASTRA_GATE_01_PROBE
```
