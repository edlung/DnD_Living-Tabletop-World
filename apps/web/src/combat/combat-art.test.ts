import { CONDITIONS, CONTEXT_ACTION_IDS } from '@ltw/contracts';
import { translate } from '@ltw/ui';
import { describe, expect, it } from 'vitest';

import '../i18n/ru.ts';
import '../i18n/ru-conditions.ts';
import '../i18n/ru-play.ts';
import '../i18n/ru-visual.ts';
import { CATALOG_NAMES, GLYPH_NAMES } from '../visual/ui-kit-names.ts';
import {
  actionEffect,
  catalogArtOf,
  COMBAT_ACTIONS,
  TURN_ACTIONS,
  conditionGlyph,
  optionLabel,
  shortLabelOf,
  optionArtUrl,
  optionLabelFor,
  shortLabelFor,
  suggestionArt,
} from './combat-art.ts';

const glyphs = new Set<string>(GLYPH_NAMES);

describe('combat option pictures and words', () => {
  it('shows each battlefield option with the catalog art of the entry its command uses', () => {
    // A weapon attack's picture is its weapon's (`optionArtUrl`), checked below; so is an extra
    // attack's (docs/adr/0047-weapons.md).
    const weaponOptions = new Set(['weapon_attack', 'offhand_attack', 'cleave_attack']);
    for (const action of COMBAT_ACTIONS.filter((id) => !weaponOptions.has(id))) {
      const art = catalogArtOf(action);
      expect(art, action).not.toBeNull();
      if (!art) continue;
      expect((CATALOG_NAMES[art.kind] as readonly string[]).includes(art.id), action).toBe(true);
    }
    expect(catalogArtOf('longbow_attack')).toEqual({ kind: 'weapons', id: 'longbow' });
    expect(catalogArtOf('hunters_mark')).toEqual({ kind: 'spells', id: 'hunters-mark' });
    expect(catalogArtOf('talk')).toBeNull();
  });

  it('pictures and names a weapon attack by its weapon (Stage 520)', () => {
    const strike = {
      id: 'weapon_attack',
      weapon: 'shortsword',
      legal: true,
      relevance: 'low',
    } as const;
    expect(optionArtUrl(strike)).not.toBeNull();
    const t = (key: string, params?: Record<string, string | number>) =>
      key.replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ''));
    expect(optionLabelFor(t, strike, 'Goblin')).toBe('Attack Goblin with Shortsword');
    expect(shortLabelFor(t, strike)).toBe('Shortsword');
    // The extra attacks name their weapon too; the short words stay inside the full ones.
    const other = { ...strike, id: 'offhand_attack', weapon: 'dagger' } as const;
    expect(optionArtUrl(other)).not.toBeNull();
    expect(shortLabelFor(t, other)).toBe('Other hand: Dagger');
    expect(optionLabelFor(t, other, 'Goblin')).toBe('Other hand: Dagger at Goblin');
    const cleave = { ...strike, id: 'cleave_attack', weapon: 'greataxe' } as const;
    expect(shortLabelFor(t, cleave)).toBe('Cleave: Greataxe');
    expect(optionLabelFor(t, cleave, 'Goblin')).toContain(shortLabelFor(t, cleave));
  });

  it('keys a suggested creature turn’s art by its attack or spell ID, and nothing else', () => {
    expect(suggestionArt({ type: 'Attack', attackId: 'scimitar' })).toEqual({
      kind: 'weapons',
      id: 'scimitar',
    });
    expect(suggestionArt({ type: 'CastSpell', spellId: 'ashen-bolt' })).toEqual({
      kind: 'spells',
      id: 'ashen-bolt',
    });
    expect(suggestionArt({ type: 'EndTurn' })).toBeNull();
    expect(suggestionArt({ type: 'MoveCombatant' })).toBeNull();
  });

  it('keeps each tray’s short words inside the option’s full name, in both languages', () => {
    for (const language of ['en', 'ru'] as const) {
      const t = (key: string, params?: Readonly<Record<string, string | number>>) =>
        translate(language, key, params);
      for (const action of [...COMBAT_ACTIONS, ...TURN_ACTIONS]) {
        const full = optionLabel(t, action, 'creature-10fb59d4').toLowerCase();
        expect(full, `${language} ${action}`).toContain(t(shortLabelOf(action)).toLowerCase());
      }
    }
    expect(optionLabel((key, params) => translate('en', key, params), 'longbow_attack', 'X')).toBe(
      'Attack X with longbow',
    );
  });

  it('says what each action beside Attack and Magic does, in both languages', () => {
    const en = (key: string) => translate('en', key);
    const ru = (key: string) => translate('ru', key);
    for (const action of TURN_ACTIONS) {
      const effect = actionEffect(en, action);
      expect(effect, action).not.toBeNull();
      expect(actionEffect(ru, action), action).not.toBe(effect);
    }
    expect(actionEffect(en, 'longbow_attack')).toBeNull();
  });

  it('marks every condition with its own glyph of the kit, never the general warning', () => {
    for (const condition of CONDITIONS) {
      expect(glyphs.has(conditionGlyph(condition))).toBe(true);
      expect(conditionGlyph(condition)).toBe(condition);
    }
  });

  it('knows every context action the contract lists', () => {
    for (const action of CONTEXT_ACTION_IDS) expect(shortLabelOf(action).length).toBeGreaterThan(0);
  });
});
