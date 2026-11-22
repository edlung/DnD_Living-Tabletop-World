-- The DM's place in the campaign's book (docs/adr/0074-dm-book.md §3.4): the ribbon, the chapters
-- played and the DM's notes on a page, one document a campaign. The DM's own data beside the
-- world: no event, no world state, never read by a player's or the table screen's route.
-- Additive: an application without the book reads and writes nothing here.
CREATE TABLE ltw_dm_book_places (
  campaign_id text PRIMARY KEY CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  place jsonb NOT NULL CHECK (jsonb_typeof(place) = 'object'),
  updated_at timestamptz NOT NULL
);
