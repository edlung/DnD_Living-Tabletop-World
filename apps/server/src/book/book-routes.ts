import { saveBookPlaceSchema, type BookPlace, type CampaignBookResponse } from '@ltw/contracts';
import type { CampaignSnapshot } from '@ltw/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { sendError } from '../http/errors.ts';
import { parseInput } from '../http/request-context.ts';
import type { BookPlaceStore } from './book-place-store.ts';
import type { BookSource } from './book-source.ts';

/**
 * The DM's book (docs/adr/0074-dm-book.md §3): the campaign's book with what its keys are in this
 * world, and the DM's place in it. Both routes are the DM's alone — anyone else gets the DM
 * routes' 404, which tells nothing about a book. Neither route changes the
 * world: the place is the DM's data beside it.
 */
export interface BookDependencies {
  readonly source: BookSource;
  readonly places: BookPlaceStore;
}
type AsDm = <B>(
  request: FastifyRequest,
  reply: FastifyReply,
  input: (request: FastifyRequest, reply: FastifyReply) => B | null,
) => Promise<{ campaignId: string; snapshot: CampaignSnapshot; input: B } | null>;

/** A place as it may be kept for this book: keys the book no longer has are dropped. */
function fitting(place: BookPlace, leaves: ReadonlySet<string>, chapters: ReadonlySet<string>) {
  return {
    ribbon: place.ribbon !== null && leaves.has(place.ribbon) ? place.ribbon : null,
    played: place.played.filter((key) => chapters.has(key)),
    notes: Object.fromEntries(Object.entries(place.notes).filter(([key]) => leaves.has(key))),
  };
}

export function registerBookRoutes(
  app: FastifyInstance,
  book: BookDependencies,
  clock: { now(): string },
  asDm: AsDm,
): void {
  const opened = async (snapshot: CampaignSnapshot) => {
    const result = await book.source.bookOf(snapshot.state);
    if (!result) return null;
    const chapters = new Set(result.book.chapters.map((chapter) => chapter.key));
    const leaves = new Set([
      ...chapters,
      ...result.book.chapters.flatMap((chapter) => chapter.pages.map((page) => page.key)),
    ]);
    return { ...result, chapters, leaves };
  };

  app.get('/campaigns/:campaignId/dm/book', async (request, reply) => {
    const dm = await asDm(request, reply, () => true);
    if (!dm) return reply;
    const result = await opened(dm.snapshot);
    // The DM is told plainly that there is no book: a 404 here would read as a lost sign-in.
    if (!result) return reply.send({ book: null } satisfies CampaignBookResponse);
    // A clue the party holds: revealed to any scope of the table.
    const revealed = new Set(
      [...dm.snapshot.state.investigation.revealed].map((key) =>
        key.slice(key.lastIndexOf('|') + 1),
      ),
    );
    const body: CampaignBookResponse = {
      book: {
        content: result.book,
        ids: result.ids,
        place: fitting(await book.places.read(dm.campaignId), result.leaves, result.chapters),
        found: Object.entries(result.ids.clues).flatMap(([key, id]) =>
          revealed.has(id) ? [key] : [],
        ),
      },
    };
    return reply.send(body);
  });

  app.post('/campaigns/:campaignId/dm/book/place', async (request, reply) => {
    const dm = await asDm(request, reply, (req, rep) =>
      parseInput(saveBookPlaceSchema, req.body, req, rep),
    );
    if (!dm) return reply;
    const result = await opened(dm.snapshot);
    if (!result) return sendError(reply, request, 'NOT_FOUND');
    const place = fitting(dm.input, result.leaves, result.chapters);
    await book.places.write(dm.campaignId, place, clock.now());
    return reply.send({ place });
  });
}
