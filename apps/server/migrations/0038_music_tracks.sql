-- The DM's music (Stage 690c, docs/adr/0059-atmosphere.md §3): tracks the DM uploads — MP3, OGG,
-- M4A or WAV, up to 15 MB each, at most 30 a campaign (counted under a per-campaign advisory lock)
-- — kept beside the world and private to the campaign: its members and its paired displays play
-- them, nobody else. What plays, and from when, is the table's state (migration 0037's `sound`).
-- A deleted track is gone. Additive: an older build never reads the table.

CREATE TABLE ltw_music_tracks (
  campaign_id text NOT NULL CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  track_id uuid NOT NULL,
  -- The upload's own ID: a retried upload adds the track once.
  request_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  media_type text NOT NULL CHECK (media_type IN ('audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/wav')),
  bytes bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 15728640),
  added_at timestamptz NOT NULL,
  PRIMARY KEY (campaign_id, track_id),
  UNIQUE (campaign_id, request_id)
);
-- Sound is compressed already, and a screen reads it a range at a time: kept as it is, a range is
-- read without the whole value.
ALTER TABLE ltw_music_tracks ALTER COLUMN bytes SET STORAGE EXTERNAL;
CREATE INDEX ltw_music_tracks_by_campaign ON ltw_music_tracks (campaign_id, added_at);
