# Gate 02 — Live HTTP coverage

Frozen reviewer evidence for code revision `781dc750cafbd5fa6ec4d3168be6091c1c823ae8`, reviewed on 2026-10-03. Read `../../ASTRA_GATE_02_REPORT.md` first.

Requires the handoff server at `127.0.0.1:3000` with the unchanged 83-command fixture (world clock 36000). Uses development persona tokens and performs only GET requests. Checks seeded positive controls as well as secret absence.

Run the following from the repository root. It prints a JSON summary and saves `/tmp/astra-gate-02-live-results.json`. Nonzero exit indicates a harness assertion/setup failure; assertions and requests are not independent test-case counts.

```bash
node --input-type=module <<'ASTRA_GATE_02_PROBE'
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
const json = async (p) => JSON.parse(await readFile(p, "utf8"));
const mb = await json("fixtures/ravenford/memory-boundary.json");
const kb = await json("fixtures/ravenford/knowledge-boundary.json");
const seeds = await Promise.all(
  ["kernel", "knowledge", "memory"].map((x) =>
    json(`fixtures/ravenford/${x}-seed.json`),
  ),
);
const memories = seeds[2].commands.filter((c) => c.type === "RecordMemory");
const knowledge = seeds[1].commands.filter((c) => c.type === "AddKnowledge");
const entityCommands = seeds
  .flatMap((s) => s.commands)
  .filter((c) => c.type === "CreateEntity");
const ps = [
  "DM",
  "PUBLIC",
  "PARTY",
  "PLAYER",
  "CHARACTER:elowen-starwhisper",
  "NPC:mira-vale",
  "NPC:orin-stonebeard",
  "NPC:captain-thorne",
];
const tokens = {
  dm: "dev-dm-ravenford",
  player: "dev-player-elowen",
  outsider: "dev-outsider",
};
const base = "http://127.0.0.1:3000/campaigns/ravenford";
const checks = {},
  failures = [];
let requests = 0;
function check(group, label, f) {
  checks[group] = (checks[group] ?? 0) + 1;
  try {
    f();
  } catch (e) {
    failures.push({ group, label, message: e.message });
  }
}
const sort = (x) => [...x].sort();
async function req(path, who = "player", options = {}) {
  const r = await fetch(base + path, {
    ...options,
    headers: {
      ...(who ? { authorization: `Bearer ${tokens[who]}` } : {}),
      ...options.headers,
    },
  });
  const text = await r.text();
  requests++;
  check("headers", path, () => {
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.headers.get("vary"), "Authorization");
  });
  return { status: r.status, body: JSON.parse(text), text };
}
const label = (p) => (p === "PLAYER" ? "CHARACTER:elowen-starwhisper" : p);
const who = (p) => (p === "DM" || p.startsWith("NPC:") ? "dm" : "player");
function scan(r, p) {
  if (r.status !== 200 || p === "DM") return;
  for (const m of [
    ...(mb.forbiddenMarkers[label(p)] ?? []),
    ...(kb.forbiddenMarkers[label(p)] ?? []),
  ])
    check("forbidden-markers", p + ":" + m, () =>
      assert.ok(!r.text.includes(m)),
    );
  check("no-dm-metadata", p, () =>
    assert.ok(
      !/"(?:claim|aspect|value|origin|dc|clueId|disclosure|sequence|recordedAt|witnesses)":/.test(
        r.text,
      ),
    ),
  );
}
for (const p of ps) {
  const qp = `perspective=${encodeURIComponent(p)}`;
  const allowed =
    p === "DM" ? memories.map((m) => m.memoryId) : mb.visible[label(p)];
  const allowedK =
    p === "DM" ? knowledge.map((k) => k.knowledgeId) : kb.visible[label(p)];
  const all = await req(`/memories?${qp}`, who(p));
  scan(all, p);
  check("memory-visible-sets", p, () =>
    assert.deepEqual(
      sort(all.body.memories.map((x) => x.memory.memoryId)),
      sort(allowed),
    ),
  );
  const k = await req(`/knowledge?${qp}`, who(p));
  scan(k, p);
  check("knowledge-regression", p, () =>
    assert.deepEqual(
      sort(k.body.knowledge.map((x) => x.knowledgeId)),
      sort(allowedK),
    ),
  );
  for (const id of [...memories.map((m) => m.memoryId), "never-existed"]) {
    const r = await req(`/memories/${id}?${qp}`, who(p));
    scan(r, p);
    check("memory-direct", p + ":" + id, () =>
      assert.equal(r.status, allowed.includes(id) ? 200 : 404),
    );
  }
  for (const kind of [
    "OBSERVATION",
    "CONVERSATION",
    "DISCOVERY",
    "DECISION",
    "CONSEQUENCE",
  ]) {
    const r = await req(`/memories?${qp}&kind=${kind}`, who(p));
    scan(r, p);
    check("memory-kind", p + ":" + kind, () =>
      assert.deepEqual(
        sort(r.body.memories.map((x) => x.memory.memoryId)),
        sort(
          memories
            .filter(
              (m) => allowed.includes(m.memoryId) && m.memoryKind === kind,
            )
            .map((m) => m.memoryId),
        ),
      ),
    );
  }
  for (const e of [...entityCommands.map((e) => e.entityId), "never-existed"]) {
    const r = await req(`/memories?${qp}&entity=${e}`, who(p));
    scan(r, p);
    check("memory-entity", p + ":" + e, () =>
      assert.deepEqual(
        sort(r.body.memories.map((x) => x.memory.memoryId)),
        sort(
          memories
            .filter(
              (m) =>
                allowed.includes(m.memoryId) &&
                (m.participants?.includes(e) || m.locationId === e),
            )
            .map((m) => m.memoryId),
        ),
      ),
    );
  }
  for (const time of [
    -17366401, -17366400, -17323200, -154800, 0, 34199, 34200, 34500, 35400,
    35700, 36000, 36001,
  ]) {
    const r = await req(`/memories?${qp}&asOf=${time}`, who(p));
    scan(r, p);
    check("memory-time", p + ":" + time, () => {
      assert.equal(r.status, time > 36000 ? 400 : 200);
      if (r.status === 200)
        assert.deepEqual(
          sort(r.body.memories.map((x) => x.memory.memoryId)),
          sort(
            memories
              .filter(
                (m) => allowed.includes(m.memoryId) && m.occurredAt <= time,
              )
              .map((m) => m.memoryId),
          ),
        );
    });
  }
  for (const q of [
    "Ashen Circle",
    "symbol",
    "patrol",
    "caravan",
    "Mira",
    "Orin",
    "reagent",
    "zzzz-no-match",
  ]) {
    const r = await req(`/memories?${qp}&q=${encodeURIComponent(q)}`, who(p));
    scan(r, p);
    check("memory-text", p + ":" + q, () => {
      assert.ok(
        r.body.memories.every((x) => allowed.includes(x.memory.memoryId)),
      );
      if (q === "Ashen Circle" || q === "zzzz-no-match")
        assert.equal(r.body.total, 0);
    });
  }
  for (const loc of [
    "market-square",
    "ravenford",
    "old-trade-road",
    "orins-alchemy",
    "north-gate",
    "abandoned-caravan-site",
    "never-existed",
  ]) {
    const r = await req(`/memories?${qp}&location=${loc}`, who(p));
    scan(r, p);
    check("memory-location-fixture", p + ":" + loc, () =>
      assert.ok(
        r.body.memories.every((x) => allowed.includes(x.memory.memoryId)),
      ),
    );
  }
  const limit = await req(`/memories?${qp}&limit=1`, who(p));
  check("memory-limit", p, () => {
    assert.equal(limit.body.total, allowed.length);
    assert.equal(limit.body.memories.length, 1);
  });
  const range = await req(`/memories?${qp}&from=34200&to=35400`, who(p));
  scan(range, p);
  check("memory-window", p, () =>
    assert.deepEqual(
      sort(range.body.memories.map((x) => x.memory.memoryId)),
      sort(
        memories
          .filter(
            (m) =>
              allowed.includes(m.memoryId) &&
              m.occurredAt >= 34200 &&
              m.occurredAt <= 35400,
          )
          .map((m) => m.memoryId),
      ),
    ),
  );
  const absent = await req(`/memories?${qp}&session=not-a-session`, who(p));
  check("memory-session", p, () => assert.equal(absent.body.total, 0));
}
const known = new Set(["elowen-starwhisper"]);
for (const k of knowledge.filter((k) =>
  kb.visible["CHARACTER:elowen-starwhisper"].includes(k.knowledgeId),
)) {
  for (const id of k.subjects ?? []) known.add(id);
  if (k.attributedTo) known.add(k.attributedTo);
}
for (const m of memories.filter((m) =>
  mb.visible["CHARACTER:elowen-starwhisper"].includes(m.memoryId),
)) {
  for (const id of m.participants ?? []) known.add(id);
  if (m.locationId) known.add(m.locationId);
}
const perceived = new Set([
  "market-square",
  "ravenford",
  "mira-vale",
  "elowen-starwhisper",
]);
for (const e of entityCommands)
  if (
    e.placement?.locationId === "market-square" ||
    e.location?.parentId === "market-square"
  )
    perceived.add(e.entityId);
for (const id of [...entityCommands.map((e) => e.entityId), "never-existed"]) {
  const r = await req(`/entities/${id}/context?perspective=PLAYER`);
  scan(r, "PLAYER");
  check("context-crawl", id, () => {
    assert.equal(r.status, known.has(id) || perceived.has(id) ? 200 : 404);
    if (r.status === 200) {
      assert.ok(!r.text.includes("description"));
      if (!perceived.has(id))
        assert.equal(r.body.context.visibleState.status, undefined);
    }
  });
}
for (const route of [
  "/memories",
  "/memories/mem-orin-prior-symbol",
  "/entities/mira-vale/context",
]) {
  for (const q of [
    "",
    "perspective=",
    "perspective=PLAYER&perspective=DM",
    "perspective=DM&perspective=PLAYER",
    "perspective=PLAYER&scope=DM",
    "perspective%5Bkind%5D=DM",
    "perspective=PLAYER&asOf=Infinity",
  ]) {
    const r = await req(`${route}?${q}`);
    check("malformed", route + q, () => assert.equal(r.status, 400));
  }
  for (const p of ["DM", "NPC:orin-stonebeard", "CHARACTER:no-such"]) {
    const r = await req(`${route}?perspective=${p}`);
    check("forgery", route + p, () => assert.equal(r.status, 403));
  }
  for (const u of [null, "outsider"]) {
    const r = await req(`${route}?perspective=PLAYER`, u);
    check("authentication", route + u, () =>
      assert.equal(r.status, u ? 404 : 401),
    );
  }
}
for (const p of ["DM", "PUBLIC", "PARTY", "NPC:mira-vale"]) {
  const r = await req(`/entities/mira-vale/context?perspective=${p}`, "dm");
  check("context-no-actor", p, () => assert.equal(r.status, 403));
}
for (const u of ["player", "dm", "outsider", null]) {
  const r = await req("/sessions", u);
  check("sessions-membership", String(u), () =>
    assert.equal(r.status, u === "dm" || u === "player" ? 200 : u ? 404 : 401),
  );
}
await Promise.all(
  Array.from({ length: 80 }, async (_, i) => {
    const p = ps[i % ps.length];
    const r = await req(`/memories?perspective=${p}`, who(p));
    scan(r, p);
    check("interleaving", p, () =>
      assert.deepEqual(
        sort(r.body.memories.map((x) => x.memory.memoryId)),
        sort(
          p === "DM" ? memories.map((x) => x.memoryId) : mb.visible[label(p)],
        ),
      ),
    );
  }),
);
const summary = { requests, checks, failures };
await writeFile(
  "/tmp/astra-gate-02-live-results.json",
  JSON.stringify(summary, null, 2) + "\n",
);
console.log(JSON.stringify(summary, null, 2));
process.exitCode = failures.length ? 1 : 0;
ASTRA_GATE_02_PROBE
```
