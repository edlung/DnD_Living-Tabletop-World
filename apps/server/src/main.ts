import { createHealthServer } from './http/health-server.ts';
import { loadConfig } from './platform/config/config.ts';
import { createLogger } from './platform/logging/logger.ts';

/**
 * Server composition root. Wires platform services; owns no domain logic.
 * Domain modules are composed here as later stages introduce them.
 */
function main(): void {
  const config = loadConfig();
  const logger = createLogger({ service: 'ltw-server', level: config.logLevel });
  const server = createHealthServer({ logger: logger.child({ module: 'http' }) });

  server.listen(config.http.port, config.http.host, () => {
    logger.info({ nodeEnv: config.nodeEnv, address: server.address() }, 'server listening');
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info({ signal }, 'shutting down');
    server.close((error) => {
      if (error) {
        logger.error({ err: error }, 'shutdown failed');
        process.exitCode = 1;
      }
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main();
