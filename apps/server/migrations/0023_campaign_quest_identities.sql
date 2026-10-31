-- Gate 07 (G07-03): quests and their stages get opaque server identities, as entities do, because
-- quest logs reach players and an authored slug can state a plot point. A stage slug is unique
-- only within its quest, so a stage's local key is `<quest>/<stage>`. Additive: an earlier image
-- writes neither namespace and never reads them.
ALTER TABLE ltw_campaign_package_identities
  DROP CONSTRAINT ltw_campaign_package_identities_namespace_check,
  DROP CONSTRAINT ltw_campaign_package_identities_local_key_check,
  ADD CONSTRAINT ltw_campaign_package_identities_namespace_check CHECK (
    namespace IN ('entities', 'knowledge', 'clues', 'encounters', 'scene', 'quests', 'quest-stages')
  ),
  ADD CONSTRAINT ltw_campaign_package_identities_local_key_check CHECK (
    CASE
      WHEN namespace = 'quest-stages'
        THEN local_key ~ '^[a-z][a-z0-9-]{0,47}/[a-z][a-z0-9-]{0,47}$'
      ELSE local_key ~ '^[a-z][a-z0-9-]{0,47}$'
    END
  );
