import { registerRussian } from '@ltw/ui';

/**
 * Russian for space and movement (Stage 640f, docs/adr/0049-space-and-movement.md): creature
 * sizes in a square's name, walls, a squeeze, a target too large to take hold of.
 */
registerRussian({
  // A combatant's size in a square's name
  tiny: 'крошечный',
  small: 'маленький',
  large: 'большой',
  huge: 'огромный',
  gargantuan: 'громадный',
  squeezed: 'протискивается',

  // Walls
  wall: 'стена',
  Wall: 'Стена',
  'Wall: no one stands in it or crosses it': 'Стена: здесь нельзя стоять и проходить',

  // A refusal's reason
  'too large': 'слишком велик',
});
