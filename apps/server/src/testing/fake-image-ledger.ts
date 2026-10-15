import type { ImageCharge, ImageLedger, ImageSettlement, ReserveResult } from '../images/ledger.ts';

/**
 * Test support (excluded from builds): an image ledger that records what the generator reserved
 * and settled, answering reservations as told. It is no spending authority: production uses only
 * `PostgresImageLedger` (docs/adr/0035-images.md §2).
 */
export class RecordingImageLedger implements ImageLedger {
  readonly reserved: ImageCharge[] = [];
  readonly settled: { readonly chargeId: string; readonly settlement: ImageSettlement }[] = [];
  answer: ReserveResult | 'throw' = 'reserved';
  failSettle = false;

  reserve(charge: ImageCharge): Promise<ReserveResult> {
    if (this.answer === 'throw') return Promise.reject(new Error('ledger down'));
    if (this.answer === 'reserved') this.reserved.push(charge);
    return Promise.resolve(this.answer);
  }

  settle(chargeId: string, settlement: ImageSettlement): Promise<void> {
    if (this.failSettle) return Promise.reject(new Error('ledger down'));
    this.settled.push({ chargeId, settlement });
    return Promise.resolve();
  }
}
