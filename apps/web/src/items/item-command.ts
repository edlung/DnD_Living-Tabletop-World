import type { KernelCommandOf } from '@ltw/contracts';

/** The item commands a player gives for their own character (docs/adr/0039-item-possession.md). */
export type ItemCommand = KernelCommandOf<
  | 'EquipItem'
  | 'UnequipItem'
  | 'UseItem'
  | 'GiveItem'
  | 'DropItem'
  | 'TakeItem'
  | 'SplitCoins'
  | 'BuyItem'
  | 'SellItem'
>;

/** An item command before the acting character is named. */
export type ItemCommandBody = ItemCommand extends infer C
  ? C extends ItemCommand
    ? Omit<C, 'characterId'>
    : never
  : never;
