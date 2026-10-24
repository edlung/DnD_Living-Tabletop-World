import { campaignIdSchema } from '@ltw/contracts';

import { IMAGE_GENERATORS, type ImageGeneratorKind } from '../../images/models.ts';

/**
 * `pnpm images:smoke` arguments (`../image-smoke.ts`). The generator is what the operator started
 * the server with (`LTW_IMAGE_GENERATOR`): the smoke checks the produced image and the ledger
 * against it, and refuses a paid run without a stored ceiling. Only a loopback server is driven:
 * development persona tokens never leave the machine.
 */
export interface SmokeOptions {
  readonly server: URL;
  readonly campaignId: string;
  readonly generator: ImageGeneratorKind;
  /** The bounded wait for the image job, from its request to its outcome. */
  readonly timeoutMs: number;
  readonly pollMs: number;
}

export class SmokeUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmokeUsageError';
  }
}

export const SMOKE_USAGE =
  'usage: pnpm images:smoke --generator placeholder|openrouter-openai ' +
  '[--server http://127.0.0.1:3000] [--campaign ravenford] [--timeout-seconds 300] [--poll-seconds 2]';

const FLAGS = new Set(['server', 'campaign', 'generator', 'timeout-seconds', 'poll-seconds']);
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

function seconds(text: string, flag: string, max: number): number {
  if (!/^[1-9][0-9]{0,4}$/.test(text) || Number(text) > max) {
    throw new SmokeUsageError(`--${flag} expects whole seconds (1-${String(max)})`);
  }
  return Number(text) * 1_000;
}

function server(text: string): URL {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new SmokeUsageError('--server expects a URL such as http://127.0.0.1:3000');
  }
  if (url.protocol !== 'http:' || !LOOPBACK.has(url.hostname) || url.pathname !== '/') {
    throw new SmokeUsageError('--server must be a local server: http://127.0.0.1:<port>');
  }
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    throw new SmokeUsageError('--server takes no credentials, query or fragment');
  }
  return url;
}

export function parseSmokeArgs(argv: readonly string[]): SmokeOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    const name = arg.startsWith('--') ? arg.slice(2) : '';
    if (!FLAGS.has(name)) throw new SmokeUsageError(`unexpected argument ${arg}`);
    const value = argv[(index += 1)];
    if (value === undefined || value.startsWith('--')) {
      throw new SmokeUsageError(`--${name} needs a value`);
    }
    if (values.has(name)) throw new SmokeUsageError(`--${name} given twice`);
    values.set(name, value);
  }
  const generator = values.get('generator');
  if (generator === undefined) {
    throw new SmokeUsageError(
      `--generator is required: the server's LTW_IMAGE_GENERATOR (${IMAGE_GENERATORS.join(' or ')})`,
    );
  }
  if (!(IMAGE_GENERATORS as readonly string[]).includes(generator)) {
    throw new SmokeUsageError(`--generator must be ${IMAGE_GENERATORS.join(' or ')}`);
  }
  const campaign = campaignIdSchema.safeParse(values.get('campaign') ?? 'ravenford');
  if (!campaign.success) throw new SmokeUsageError('--campaign expects a campaign ID');
  return {
    server: server(values.get('server') ?? 'http://127.0.0.1:3000'),
    campaignId: campaign.data,
    generator: generator as ImageGeneratorKind,
    timeoutMs: seconds(values.get('timeout-seconds') ?? '300', 'timeout-seconds', 3_600),
    pollMs: seconds(values.get('poll-seconds') ?? '2', 'poll-seconds', 60),
  };
}
