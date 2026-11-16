-- A place's own sound (docs/adr/0073-table-ideas.md §6, Stage 850): the DM's preparation — an
-- ambience and one of the DM's tracks — applied to the table's sound when the DM shows the place.
-- Table data beside the world, never canonical: no World Engine decision reads it. One row a
-- place that brings a sound; replaced on save, removed when both are cleared. A track deleted
-- since leaves the row, and the place then brings its ambience alone. Additive: an older build
-- leaves the table alone.
CREATE TABLE ltw_place_sounds (
  campaign_id text NOT NULL CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  location_id text NOT NULL CHECK (location_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$'),
  -- The ambience the place brings; null leaves the table's ambience as it is.
  ambience text CHECK (ambience IN ('scene', 'none', 'rain', 'wind', 'fire', 'crowd', 'night')),
  -- The track the place brings; null leaves the music as it is.
  track_id uuid,
  updated_at timestamptz NOT NULL,
  CHECK (ambience IS NOT NULL OR track_id IS NOT NULL),
  PRIMARY KEY (campaign_id, location_id)
);
