import { registerRussian } from '@ltw/ui';

/**
 * Russian for the DM's screen (docs/adr/0043-dm-screen.md, Stage 620): the DM's changes by hand
 * and their history, group checks, notes. The DM is «мастер», as everywhere in the client.
 */
registerRussian({
  // The DM's hand in the history
  '{name}: {amount} damage ({type}), hit points {before} → {after}':
    '{name}: урон {amount} ({type}), хиты {before} → {after}',
  '{name}: healed {amount}, hit points {before} → {after}':
    '{name}: лечение {amount}, хиты {before} → {after}',
  '{name}: now {condition}': '{name}: состояние «{condition}»',
  '{name}: no longer {condition}': '{name}: снято состояние «{condition}»',
  '{name}: Heroic Inspiration granted': '{name}: получено героическое вдохновение',
  '{name}: Heroic Inspiration taken back': '{name}: героическое вдохновение отнято',
  'Ruling: {summary}': 'Решение мастера: {summary}',
  'By hand: “{reason}”': 'Вручную: «{reason}»',
  'By hand': 'Вручную',
  '{name} joined the fight': '{name}: вступает в бой',
  '{name} left the fight': '{name}: выходит из боя',
  '{name} delayed the turn': '{name}: откладывает ход',
  '{name}: initiative {total}': '{name}: инициатива {total}',

  // Damage types a play screen names (the rest are in ru-character)
  Acid: 'Кислота',
  Cold: 'Холод',
  Lightning: 'Молния',
  Necrotic: 'Некротический',
  Poison: 'Яд',
  Psychic: 'Психический',
  Radiant: 'Излучение',
  Thunder: 'Гром',
});
