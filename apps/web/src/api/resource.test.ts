import { describe, expect, it } from 'vitest';

import { ReadOrder } from './resource.ts';

/**
 * Background re-reads of one generation (docs/adr/0033-live-session.md §4): late and
 * out-of-order answers never replace newer data, and a failure never hides a value.
 */
describe('the order of reads', () => {
  it('lets a newer success replace an older one, never the reverse', () => {
    const order = new ReadOrder();
    const foreground = order.start();
    const background = order.start();
    expect(order.succeeded(background)).toBe(true);
    // The foreground answer arrives late: it is older than what is shown.
    expect(order.succeeded(foreground)).toBe(false);
    const next = order.start();
    expect(order.succeeded(next)).toBe(true);
  });

  it('shows a foreground failure only while nothing newer succeeded', () => {
    const failing = new ReadOrder();
    expect(failing.failed(failing.start())).toBe(true);

    const recovered = new ReadOrder();
    const foreground = recovered.start();
    expect(recovered.succeeded(recovered.start())).toBe(true);
    expect(recovered.failed(foreground)).toBe(false);
  });

  it('accepts a duplicate answer of the shown read', () => {
    const order = new ReadOrder();
    const ticket = order.start();
    expect(order.succeeded(ticket)).toBe(true);
    expect(order.succeeded(ticket)).toBe(true);
  });
});
