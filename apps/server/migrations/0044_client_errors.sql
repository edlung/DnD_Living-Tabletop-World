-- Client error reports (docs/adr/0073-table-ideas.md §1, Stage 800): what a broken page told this
-- server. Operations data beside the world, never canonical: no World Engine decision reads it.
-- Every column is an enumeration, a number or a strict pattern — no message, no address, no name.
-- One row for each distinct report of a campaign (the empty string: of none), counted when seen
-- again; rows are removed after thirty days and by the DM's word. Additive: an older build leaves
-- the table alone.
CREATE TABLE ltw_client_errors (
  -- The campaign whose member's screen it was, or the empty string.
  campaign_id text NOT NULL CHECK (campaign_id = '' OR campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  -- What tells one report from another: a hash of every field below but the build and the times.
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{32}$'),
  role text NOT NULL CHECK (role IN ('nobody', 'player', 'dm', 'display')),
  kind text NOT NULL CHECK (kind IN ('render', 'error', 'rejection')),
  name text NOT NULL CHECK (name ~ '^[A-Za-z]{1,40}$'),
  page text NOT NULL CHECK (page ~ '^[a-z][a-z-]{0,23}$'),
  part text NOT NULL CHECK (part ~ '^[a-z][a-z-]{0,23}$'),
  browser text NOT NULL CHECK (browser ~ '^[a-z]{1,16}$'),
  browser_version integer NOT NULL CHECK (browser_version BETWEEN 0 AND 9999),
  system text NOT NULL CHECK (system ~ '^[a-z]{1,16}$'),
  shell text NOT NULL CHECK (shell ~ '^[a-z]{1,16}$'),
  -- Up to three frames of the application's own scripts: [{file, line, column}].
  place jsonb NOT NULL CHECK (jsonb_typeof(place) = 'array' AND octet_length(place::text) <= 1024),
  -- The server's build when the report was last seen.
  build text NOT NULL CHECK (build ~ '^[A-Za-z0-9._-]{1,64}$'),
  seen_count integer NOT NULL CHECK (seen_count >= 1),
  first_at timestamptz NOT NULL,
  last_at timestamptz NOT NULL,
  CHECK (last_at >= first_at),
  CHECK ((campaign_id = '') = (role = 'nobody')),
  PRIMARY KEY (campaign_id, fingerprint)
);

CREATE INDEX ltw_client_errors_last_at ON ltw_client_errors (last_at);
