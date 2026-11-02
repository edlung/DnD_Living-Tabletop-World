import type { TableKey, TableOfferResponse, TableSeatResponse } from '@ltw/contracts';

/**
 * The table's join link from the browser (docs/adr/0042-table-display.md §5): its free seats, then
 * the chosen seat's single-use invitation, which the join page takes like any other. Nothing is
 * kept: the link's token waits in its holder, a typed code in its field.
 */
type Transport = typeof fetch;

async function post(transport: Transport, path: string, body: unknown) {
  try {
    return await transport(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'error',
    });
  } catch {
    return null;
  }
}

export type TableRefusal = 'refused' | 'limited' | 'unreachable';

const refusalOf = (response: Response | null): TableRefusal =>
  response === null ? 'unreachable' : response.status === 429 ? 'limited' : 'refused';

export async function readTableOffer(
  transport: Transport,
  key: TableKey,
): Promise<TableOfferResponse | TableRefusal> {
  const response = await post(transport, '/api/auth/table/offer', { key });
  if (!response?.ok) return refusalOf(response);
  try {
    return (await response.json()) as TableOfferResponse;
  } catch {
    return 'unreachable';
  }
}

export async function takeTableSeat(
  transport: Transport,
  key: TableKey,
  characterId: string,
): Promise<TableSeatResponse | TableRefusal | 'taken'> {
  const response = await post(transport, '/api/auth/table/seat', { key, characterId });
  if (response?.status === 409) return 'taken';
  if (!response?.ok) return refusalOf(response);
  try {
    return (await response.json()) as TableSeatResponse;
  } catch {
    return 'unreachable';
  }
}
