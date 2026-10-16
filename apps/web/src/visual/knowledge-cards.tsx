import type { KnowledgeType, KnowledgeView } from '@ltw/contracts';
import { KnowledgeDetails, useT } from '@ltw/ui';

import { Glyph } from './glyph.tsx';
import { knowledgeGlyph, knowledgeTone } from './glyph-map.ts';

const typeMark = (type: KnowledgeType) => <Glyph name={knowledgeGlyph(type)} />;

/**
 * Typed records as cards (docs/STAGE_320_DESIGN.md §5.3): the type's glyph, word and hue, the
 * statement, attribution and provenance — never merged with speech. The shared component keeps
 * every supplied field; the glyph only marks the word.
 */
export function KnowledgeCards({ knowledge }: { readonly knowledge: readonly KnowledgeView[] }) {
  return <KnowledgeDetails knowledge={knowledge} typeMark={typeMark} />;
}

/** One epistemic type as its glyph, word and hue. */
export function KnowledgeBadge({ type }: { readonly type: KnowledgeType }) {
  const t = useT();
  return (
    <span className={`badge badge--${knowledgeTone(type)}`}>
      <Glyph name={knowledgeGlyph(type)} />
      {t(type)}
    </span>
  );
}
