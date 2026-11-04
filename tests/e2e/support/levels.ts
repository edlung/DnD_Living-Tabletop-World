import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The DM takes Elowen's next level for her (docs/adr/0056-characters-from-the-srd.md §3): Wizard 9,
 * with the two spells the level writes in her spellbook, both prepared. `overview` is her
 * character dialog's Overview.
 */
export async function takeWizardLevel(page: Page, overview: Locator): Promise<void> {
  await overview.getByRole('button', { name: 'Take level 16' }).click();
  const level = page.getByRole('dialog', { name: 'Level 16' });
  await level.getByLabel('Class', { exact: true }).selectOption({ label: 'Wizard 9' });
  for (const name of [/^Your spellbook/, /^Prepared spells/]) {
    const group = level.getByRole('group', { name });
    for (const box of [0, 1]) await group.getByRole('checkbox').nth(box).check();
  }
  await level.getByRole('button', { name: 'Take the level' }).click();
  await expect(overview.getByText('Level 16 is taken.')).toBeVisible({ timeout: 15_000 });
}
