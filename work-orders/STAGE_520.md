# Work Order — Stage 520: Inventory 2.0, weapons and coins

Authority: owner request 2026-11-01, program `docs/PRODUCT_COMPLETION_PLAN.md` (decisions 7 and 8);
ADR 0039 (item possession) amended below.

## Deliver

1. **Weapons** in the item catalog (14 Ravenford weapons, each naming the SRD 5.2.1 weapon it fights
   as) and the rules' `WEAPONS` for all of them (damage, reach or range, finesse, light, heavy,
   two-handed, versatile, thrown, loading, ammunition).
2. **Attacks with what a character wields**: the combat engine accepts the weapon items held in a
   hand beside the sheet's weapons; finesse takes the better of Strength and Dexterity; melee reach
   5 ft. The Context Engine lists `weapon_attack` per wielded weapon in a fight; the turn tray and the
   side panel show it with the weapon's picture.
3. **Coins**: gold crowns, silver marks, copper pennies (stackable catalog items; 50 to the pound).
4. **Inventory UI**: the purse and the load (Strength × 15 lb, shown, not enforced), the paper doll
   (nine slots around the GPT figure silhouette), the bag of picture tiles with filters, the item
   card (picture, kind, description, the weapon's attack for this character, armor, effect, weight,
   worth, actions); drag from the bag to a slot that fits and is free, and back to take off; a taken
   slot is said with a "Take off" for what is there.
5. **Seed**: Elowen starts with her yew longbow in hand, a short blade, a skinning knife and a purse;
   Mira and Orin carry coins and a staff.
6. GPT art for the 17 new catalog entries; RU/EN; tests (catalog, melee in hand, routes, e2e).

## Boundaries

No new kernel event or command; possession quantities stay ≤ 99 per stack (event schemas unchanged).
