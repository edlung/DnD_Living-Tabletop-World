/** The SRD's Character Advancement table (docs/adr/0056-characters-from-the-srd.md §3). */
declare const advancement: readonly {
  readonly level: number;
  readonly experience: number;
  readonly proficiencyBonus: number;
}[];
export = advancement;
