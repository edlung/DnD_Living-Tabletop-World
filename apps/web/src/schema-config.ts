import { config } from 'zod';

/**
 * The first module the client evaluates (`main.tsx` imports it before anything else). zod, which
 * `@ltw/contracts` brings into the bundle, probes `Function('')` when it builds its first object
 * schema, to compile fast parsers, unless it is jitless. The deployment's policy allows no eval
 * (`default-src 'self'`, deploy/proxy/Caddyfile), and the browser reports the probe as a policy
 * violation on every page although zod catches the refusal. The client parses nothing with those
 * schemas, so it needs no compiled parsers (docs/adr/0037-deployment.md, "Full product").
 */
config({ jitless: true });
