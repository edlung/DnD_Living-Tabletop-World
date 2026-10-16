import {
  CONTEXT_ACTION_IDS,
  DAY_PHASES,
  ENTITY_KINDS,
  KNOWLEDGE_TYPES,
  WEATHERS,
} from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  actionGlyph,
  isFigure,
  kindGlyph,
  knowledgeGlyph,
  knowledgeTone,
  phaseGlyph,
  weatherGlyph,
} from './glyph-map.ts';
import { GLYPH_NAMES } from './ui-kit-names.ts';

const known = new Set<string>(GLYPH_NAMES);

describe('glyph mappings', () => {
  it('gives every server-listed action a glyph of the kit', () => {
    for (const id of CONTEXT_ACTION_IDS) expect(known.has(actionGlyph(id)), id).toBe(true);
    expect(actionGlyph('talk')).toBe('talk');
    expect(actionGlyph('ask_about')).toBe('ask');
    expect(actionGlyph('inspect')).toBe('inspect');
    expect(actionGlyph('enter_location')).toBe('travel');
    expect(actionGlyph('counterspell')).toBe('counterspell');
  });

  it('gives each epistemic type its own glyph and hue modifier', () => {
    const glyphs = KNOWLEDGE_TYPES.map((type) => knowledgeGlyph(type));
    for (const glyph of glyphs) expect(known.has(glyph), glyph).toBe(true);
    expect(new Set(glyphs).size).toBe(KNOWLEDGE_TYPES.length);
    expect(knowledgeGlyph('FACT')).toBe('fact');
    expect(knowledgeGlyph('TESTIMONY')).toBe('testimony');
    expect(knowledgeGlyph('SECRET')).toBe('secret');
    expect(KNOWLEDGE_TYPES.map((type) => knowledgeTone(type))).toEqual([
      'fact',
      'evidence',
      'testimony',
      'rumor',
      'inference',
      'hypothesis',
      'contradiction',
      'unknown',
      'secret',
    ]);
  });

  it('marks each day phase and each weather with a glyph of its own', () => {
    const phases = DAY_PHASES.map((phase) => phaseGlyph(phase));
    for (const glyph of phases) expect(known.has(glyph), glyph).toBe(true);
    expect(new Set(phases).size).toBe(DAY_PHASES.length);
    expect(phases).toEqual([...DAY_PHASES]);
    const weathers = WEATHERS.map((weather) => weatherGlyph(weather));
    for (const glyph of weathers) expect(known.has(glyph), glyph).toBe(true);
    expect(new Set(weathers).size).toBe(WEATHERS.length);
    expect(weathers).toEqual([...WEATHERS]);
  });

  it('gives every entity kind a glyph and shows only people and creatures as figures', () => {
    for (const kind of ENTITY_KINDS) expect(known.has(kindGlyph(kind)), kind).toBe(true);
    expect(ENTITY_KINDS.filter((kind) => isFigure(kind))).toEqual(['character', 'npc', 'creature']);
  });
});
