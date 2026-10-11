import { runEval } from './eval-run.ts';
import { RUNNERS } from './eval-runners.ts';

/** `pnpm eval:ai --offline [capability] [--out dir]`; live mode is refused (see `eval-run.ts`). */
runEval(process.argv.slice(2), {
  env: process.env,
  runners: RUNNERS,
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
