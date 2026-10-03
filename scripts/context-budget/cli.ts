import { fileURLToPath } from 'node:url';

import { HARD_LIMIT, TARGET_LIMIT, checkContextBudget } from './budget.ts';

/** Usage: node scripts/context-budget/cli.ts [root]. Exits 1 on any hard-limit violation. */
const root = process.argv[2] ?? fileURLToPath(new URL('../..', import.meta.url));
const report = await checkContextBudget(root);

for (const file of report.warnings) {
  console.warn(`warn  ${file.path}: ${file.lines} lines (target <= ${TARGET_LIMIT})`);
}
for (const file of report.violations) {
  console.error(`FAIL  ${file.path}: ${file.lines} lines (hard limit ${HARD_LIMIT})`);
}

console.log(
  `context-budget: ${report.checked} active files checked, ` +
    `${report.warnings.length} over target, ${report.violations.length} over hard limit`,
);
if (report.violations.length > 0) {
  console.error('Split the listed files along a cohesive boundary; do not add exclusions.');
  process.exitCode = 1;
}
