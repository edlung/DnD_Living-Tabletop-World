-- Stage 390 / ADR 0038: immutable owner-private campaign packages and identity registry.
-- These records are authoring data; no row is an event or campaign membership.
ALTER TABLE ltw_workshop_drafts ADD CONSTRAINT ltw_workshop_drafts_owner_pair
  UNIQUE (draft_id, owner_id);

CREATE TABLE ltw_campaign_package_identities (
  draft_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  namespace text NOT NULL CHECK (namespace IN ('entities', 'knowledge', 'clues', 'encounters', 'scene')),
  local_key text NOT NULL CHECK (local_key ~ '^[a-z][a-z0-9-]{0,47}$'),
  canonical_id uuid NOT NULL UNIQUE,
  entity_kind text CHECK (entity_kind IN ('location', 'character', 'npc', 'creature', 'item', 'feature', 'faction')),
  PRIMARY KEY (draft_id, namespace, local_key),
  FOREIGN KEY (draft_id, owner_id) REFERENCES ltw_workshop_drafts (draft_id, owner_id),
  CHECK ((namespace = 'entities') = (entity_kind IS NOT NULL)),
  CHECK (namespace <> 'scene' OR local_key = 'initial')
);

CREATE TABLE ltw_campaign_package_revisions (
  draft_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  based_on_revision integer NOT NULL CHECK (based_on_revision >= 0 AND revision = based_on_revision + 1),
  request_id uuid NOT NULL,
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object' AND content ? 'schemaVersion' AND content->>'schemaVersion' = '1'),
  identities jsonb NOT NULL CHECK (jsonb_typeof(identities) = 'object'),
  digest text NOT NULL CHECK (digest ~ '^sha256:[0-9a-f]{64}$'),
  source jsonb NOT NULL CHECK (jsonb_typeof(source) = 'object' AND source ? 'kind' AND source->>'kind' IN ('OWNER', 'AI')),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (draft_id, revision),
  UNIQUE (draft_id, request_id),
  FOREIGN KEY (draft_id, owner_id) REFERENCES ltw_workshop_drafts (draft_id, owner_id),
  CHECK (source->>'kind' <> 'OWNER' OR (source ? 'actorId' AND source->>'actorId' = owner_id::text)),
  CHECK (source->>'kind' <> 'AI' OR (source ?& ARRAY['jobId', 'traceId', 'provider', 'model']
    AND jsonb_typeof(source->'jobId') = 'string' AND jsonb_typeof(source->'traceId') = 'string'
    AND jsonb_typeof(source->'provider') = 'string' AND jsonb_typeof(source->'model') = 'string'))
);
CREATE INDEX ltw_campaign_package_revisions_owner
  ON ltw_campaign_package_revisions (owner_id, draft_id, revision DESC);

CREATE TRIGGER ltw_campaign_package_identities_immutable BEFORE UPDATE OR DELETE
  ON ltw_campaign_package_identities FOR EACH ROW EXECUTE FUNCTION ltw_workshop_immutable();
CREATE TRIGGER ltw_campaign_package_identities_no_truncate BEFORE TRUNCATE
  ON ltw_campaign_package_identities FOR EACH STATEMENT EXECUTE FUNCTION ltw_workshop_immutable();
CREATE TRIGGER ltw_campaign_package_revisions_immutable BEFORE UPDATE OR DELETE
  ON ltw_campaign_package_revisions FOR EACH ROW EXECUTE FUNCTION ltw_workshop_immutable();
CREATE TRIGGER ltw_campaign_package_revisions_no_truncate BEFORE TRUNCATE
  ON ltw_campaign_package_revisions FOR EACH STATEMENT EXECUTE FUNCTION ltw_workshop_immutable();
