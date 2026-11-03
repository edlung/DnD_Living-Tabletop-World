import type { KernelCommandOf } from '@ltw/contracts';

/**
 * The DM's commands at the table (docs/adr/0043-dm-screen.md §1–2, §6): changes by hand, a ruling
 * (a party memory with a reason), changes of a running fight, a session's start and end, the
 * campaign's options (docs/adr/0056-characters-from-the-srd.md §3) —
 * submitted like any command, in the DM perspective, decided by the World Engine.
 */
export type DmTableCommand = KernelCommandOf<
  | 'AdjustHitPoints'
  | 'SetCondition'
  | 'SetExhaustion'
  | 'SetInspiration'
  | 'RecordMemory'
  | 'AddCombatant'
  | 'AddObject'
  | 'SetLight'
  | 'PaintTerrain'
  | 'SetFog'
  | 'ExposeToHazard'
  | 'SpringTrap'
  | 'InflictMentalStress'
  | 'InfectWithContagion'
  | 'ContagionCourse'
  | 'DawnRecharge'
  | 'UseCreatureAction'
  | 'RemoveCombatant'
  | 'DelayTurn'
  | 'SetInitiative'
  | 'PlaceCombatant'
  | 'CommandCreature'
  | 'StartSession'
  | 'EndSession'
  | 'SetCampaignOptions'
  | 'SetMerchant'
  | 'WorkDowntime'
  | 'SetMapPins'
  | 'SetRoute'
  | 'Travel'
>;
