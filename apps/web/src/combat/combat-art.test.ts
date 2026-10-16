import { CONDITIONS, CONTEXT_ACTION_IDS } from '@ltw/contracts';
import { translate } from '@ltw/ui';
import { describe, expect, it } from 'vitest';

import '../i18n/ru.ts';
import '../i18n/ru-play.ts';
import '../i18n/ru-visual.ts';
import { CATALOG_NAMES, GLYPH_NAMES } from '../visual/ui-kit-names.ts';
import {
  catalogArtOf,
  COMBAT_ACTIONS,
  conditionGlyph,
  optionLabel,
  shortLabelOf,
  suggestionArt,
} from './combat-art.ts';

const glyphs = new Set<string>(GLYPH_NAMES);

describe('combat option pictures and words', () => {
  it('shows each battlefield option with the catalog art of the entry its command uses', () => {
    for (const action of COMBAT_ACTIONS) {
      const art = catalogArtOf(action);
      expect(art, action).not.toBeNull();
      if (!art) continue;
      expect((CATALOG_NAMES[art.kind] as readonly string[]).includes(art.id), action).toBe(true);
    }
    expect(catalogArtOf('longbow_attack')).toEqual({ kind: 'weapons', id: 'longbow' });
    expect(catalogArtOf('hunters_mark')).toEqual({ kind: 'spells', id: 'hunters-mark' });
    expect(catalogArtOf('talk')).toBeNull();
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
      for (const action of COMBAT_ACTIONS) {
        const full = optionLabel(t, action, 'goblin-raider-1').toLowerCase();
        expect(full, `${language} ${action}`).toContain(t(shortLabelOf(action)).toLowerCase());
      }
    }
    expect(optionLabel((key, params) => translate('en', key, params), 'longbow_attack', 'X')).toBe(
      'Attack X with longbow',
    );
  });

  it('marks every condition with a glyph of the kit, Unconscious with its own', () => {
    for (const condition of CONDITIONS) expect(glyphs.has(conditionGlyph(condition))).toBe(true);
    expect(conditionGlyph('unconscious')).toBe('unconscious');
  });

  it('knows every context action the contract lists', () => {
    for (const action of CONTEXT_ACTION_IDS) expect(shortLabelOf(action).length).toBeGreaterThan(0);
  });
});
