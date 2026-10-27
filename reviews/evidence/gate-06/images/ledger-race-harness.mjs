// Gate 06 images: ceiling race on the shipped ledger code against a throwaway database.
import pg from '/app/apps/server/node_modules/pg/lib/index.js';
const { PostgresImageLedger, setImageCeiling, imageBudgetStatus } = await import('/app/apps/server/dist/images/ledger.js');
import { randomUUID } from 'node:crypto';
const url = process.env.DATABASE_URL;
const pools = [0,1,2,3].map(() => new pg.Pool({ connectionString: url, max: 10 }));
const auth = { ownerId: 'g06', authorizedOn: '2026-10-27', source: 'g06-harness' };
await setImageCeiling(pools[0], 1_000_000n, auth);   // $1.00 = two reservations of $0.50
const N = 40;
const results = await Promise.all(Array.from({ length: N }, (_, i) =>
  new PostgresImageLedger(pools[i % 4]).reserve({ chargeId: randomUUID(), campaignId: 'c', requestId: `r${i}#0`, provider: 'openrouter-openai', model: 'openai/gpt-5.4-image-2', reserveMicros: 500_000n })));
const count = (k) => results.filter((r) => r === k).length;
console.log(JSON.stringify({ attempts: N, pools: 4, reserved: count('reserved'), ceiling: count('ceiling'), status: await imageBudgetStatus(pools[0]) }));
// Settle one above its reservation (reported cost $0.90), then try more reservations.
const led = new PostgresImageLedger(pools[0]);
const ids = (await pools[0].query('SELECT charge_id FROM ltw_image_charges ORDER BY charge_id')).rows.map(r => r.charge_id);
await led.settle(ids[0], { outcome: 'generated', costMicros: 900_000n, returnedModel: 'x', providerRequestId: 'p' });
await led.settle(ids[0], { outcome: 'generated', costMicros: 1n, returnedModel: 'x', providerRequestId: 'p' }); // second settle must change nothing
console.log(JSON.stringify({ afterOverCost: await imageBudgetStatus(pools[0]), nextReserve: await led.reserve({ chargeId: randomUUID(), campaignId: 'c', requestId: 'z#0', provider: 'openrouter-openai', model: 'openai/gpt-5-image-mini', reserveMicros: 200_000n }) }));
console.log(JSON.stringify({ openCharge: ids[1] }));
await Promise.all(pools.map(p => p.end()));
