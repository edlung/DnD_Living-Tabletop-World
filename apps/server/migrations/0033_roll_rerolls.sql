-- Heroic Inspiration spent on a table check (Stage 640c,
-- docs/adr/0046-reactions-beyond-counterspell.md §6): the check rolled again, linked to the roll
-- it replaces, with the mode it was rolled in. Additive: an older build ignores both columns and
-- shows the two rolls side by side.

-- The roll this one replaces; at most one roll replaces another.
ALTER TABLE ltw_table_rolls ADD COLUMN reroll_of uuid;
ALTER TABLE ltw_table_rolls ADD CONSTRAINT ltw_table_rolls_reroll_of
  FOREIGN KEY (campaign_id, reroll_of) REFERENCES ltw_table_rolls (campaign_id, roll_id);
CREATE UNIQUE INDEX ltw_table_rolls_one_reroll ON ltw_table_rolls (campaign_id, reroll_of)
  WHERE reroll_of IS NOT NULL;

-- A check's mode (normal, Advantage, Disadvantage), so it can be rolled again the same way.
ALTER TABLE ltw_table_rolls ADD COLUMN check_mode text
  CHECK (check_mode IS NULL OR check_mode IN ('normal', 'advantage', 'disadvantage'));
