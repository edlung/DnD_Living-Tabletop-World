import { describe, expect, it } from 'vitest';

import { InMemoryProposalStore } from './proposal-store.ts';

/**
 * Exclusive sections of the in-memory store (G04-H01): one proposal's
 * sections take turns, other proposals' do not wait, and a failing section
 * still gives up its turn. The PostgreSQL store is covered by
 * `proposal-races.integration.test.ts`.
 */
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('InMemoryProposalStore.exclusive', () => {
  it('runs one proposal’s sections one at a time, in arrival order', async () => {
    const store = new InMemoryProposalStore();
    const log: string[] = [];
    const section = (name: string) =>
      store.exclusive('ravenford', 'p1', async () => {
        log.push(`${name} in`);
        await tick();
        log.push(`${name} out`);
        return name;
      });
    expect(await Promise.all([section('a'), section('b'), section('c')])).toEqual(['a', 'b', 'c']);
    expect(log).toEqual(['a in', 'a out', 'b in', 'b out', 'c in', 'c out']);
  });

  it('lets other proposals run meanwhile, and a failure release its turn', async () => {
    const store = new InMemoryProposalStore();
    const log: string[] = [];
    const slow = store.exclusive('ravenford', 'p1', async () => {
      await tick();
      log.push('p1');
      throw new Error('refused');
    });
    await store.exclusive('ravenford', 'p2', () => Promise.resolve(log.push('p2')));
    await expect(slow).rejects.toThrow('refused');
    await store.exclusive('ravenford', 'p1', () => Promise.resolve(log.push('p1 again')));
    expect(log).toEqual(['p2', 'p1', 'p1 again']);
  });
});
