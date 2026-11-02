-- The DM's short rests (Stage 530, docs/PRODUCT_COMPLETION_PLAN.md decision 9): while one is open
-- the players spend hit dice; the DM ends it. Beside the world, never canonical history: what a rest
-- does to a character goes through the World Engine as a sheet. At most one open rest per campaign.

CREATE TABLE ltw_rests (
  campaign_id text NOT NULL CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  rest_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('short')),
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  PRIMARY KEY (campaign_id, rest_id),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE UNIQUE INDEX ltw_rests_one_open ON ltw_rests (campaign_id) WHERE ended_at IS NULL;
