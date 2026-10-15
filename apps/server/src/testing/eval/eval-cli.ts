import { runEval } from './eval-run.ts';

/**
 * `pnpm eval:ai --offline [capability] [--out dir]` or
 * `pnpm eval:ai --live --approval <id> --run <id> [--model provider:model] [capability] [--out dir]`
 * (see `eval-run.ts`). Live mode sends paid requests: run it only with the owner's explicit
 * authorization for that run, after the operator registered it.
 */
runEval(process.argv.slice(2), {
  env: process.env,
  transport: globalThis.fetch,
  log: (line) => {
    console.log(line);
  },
  now: () => new Date(),
}).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : 'error');
    process.exitCode = 1;
  },
);
