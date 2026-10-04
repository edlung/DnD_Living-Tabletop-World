-- Generated asset contents (docs/adr/0022-asset-identity.md §6).
-- Bytes addressed by content hash within a campaign. Not canonical state:
-- the campaign's asset lineage (events) says which asset holds which
-- content and who may see it. Append-only, like the event store.

CREATE TABLE ltw_asset_contents (
  campaign_id text NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  media_type text NOT NULL CHECK (media_type IN ('image/svg+xml', 'image/png', 'image/webp')),
  bytes bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 2097152),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, content_hash)
);

CREATE TRIGGER ltw_asset_contents_append_only
  BEFORE UPDATE OR DELETE ON ltw_asset_contents
  FOR EACH ROW EXECUTE FUNCTION ltw_reject_history_rewrite();
CREATE TRIGGER ltw_asset_contents_no_truncate
  BEFORE TRUNCATE ON ltw_asset_contents
  FOR EACH STATEMENT EXECUTE FUNCTION ltw_reject_history_rewrite();

-- The asset worker's loop finds campaigns with asset requests.
CREATE INDEX ltw_events_asset_requests
  ON ltw_events (stream_id) WHERE event_type = 'AssetRequested';
