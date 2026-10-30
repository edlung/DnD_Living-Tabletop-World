import type { KnowledgeView } from '@ltw/contracts';
import { LanguageProvider } from '@ltw/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PreviewKnowledge } from './knowledge.tsx';

describe('preview knowledge labels', () => {
  it('retains epistemic distinctions and resolves names without exposing technical identifiers', () => {
    const npcId = '10000000-0000-4000-8000-000000000001';
    const knowledgeId = '10000000-0000-4000-8000-000000000002';
    const subject = { entityId: npcId, name: 'Arden', kind: 'npc' as const };
    const record: KnowledgeView = {
      knowledgeId,
      knowledgeType: 'RUMOR',
      scope: { kind: 'NPC', npcId },
      statement: 'People say a bell rings beneath the ice.',
      subjects: [subject],
      attributedTo: subject,
      relations: [],
      knownSince: null,
    };
    const html = renderToStaticMarkup(
      createElement(LanguageProvider, {
        language: 'en',
        children: createElement(PreviewKnowledge, { knowledge: [record], references: [subject] }),
      }),
    );
    expect(html).toContain('RUMOR');
    expect(html).toContain('NPC: Arden');
    expect(html).toContain('Attributed to Arden');
    expect(html).not.toContain(npcId);
    expect(html).not.toContain(knowledgeId);
  });
});
