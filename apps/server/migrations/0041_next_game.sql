-- The next game (docs/adr/0071-memory-and-ritual.md §3, Stage 730): when the table meets again,
-- and a line about it ("at Grandma's"). Table data beside the world, the DM's to set. Additive:
-- an older build ignores the columns and leaves them as they are when it writes the row.
ALTER TABLE ltw_table_states ADD COLUMN next_game_at timestamptz;
ALTER TABLE ltw_table_states ADD COLUMN next_game_note text NOT NULL DEFAULT ''
  CHECK (char_length(next_game_note) <= 120);
