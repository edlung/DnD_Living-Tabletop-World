-- The table's sound (Stage 690, docs/adr/0059-atmosphere.md): the ambience the DM chose (one of
-- five synthesized soundscapes, none, or by the scene) and, from 690c, the DM's track playing.
-- Presentation beside the world, never canonical. Additive: a row without it reads as a fresh
-- table's, and an older build never reads the column.
ALTER TABLE ltw_table_states ADD COLUMN sound jsonb
  CHECK (sound IS NULL OR (jsonb_typeof(sound) = 'object' AND octet_length(sound::text) <= 4096));
