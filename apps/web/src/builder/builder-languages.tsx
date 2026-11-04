import type { CharacterOptionsResponse, SrdLanguage } from '@ltw/contracts';
import { useT } from '@ltw/ui';

import { Several } from './builder-choices.tsx';
import { Problems } from './builder-fields.tsx';
import type { Builder } from './use-builder.ts';

/** A class's own languages, which no one chooses. */
const SECRET: ReadonlySet<SrdLanguage> = new Set(['common', 'druidic', 'thieves-cant']);

/**
 * The languages a new character knows (SRD 5.2.1, Character Creation step 2; docs/adr/0056-…md §2):
 * Common, and two of the standard languages chosen; a Rogue chooses one more of either table and
 * knows Thieves' Cant, a Druid knows Druidic. Named as the campaign reads them.
 */
export function LanguageChoice({
  options,
  builder,
}: {
  readonly options: CharacterOptionsResponse;
  readonly builder: Builder;
}) {
  const t = useT();
  const { draft, update } = builder;
  const rogue = draft.classId === 'rogue';
  const offered = options.languages.filter(
    (one) => !SECRET.has(one.languageId) && (rogue || !one.rare),
  );
  return (
    <>
      <Several
        legend={t('Languages beside Common')}
        wanted={rogue ? 3 : 2}
        from={offered.map((one) => one.languageId)}
        chosen={draft.languages ?? []}
        nameOf={(id) => {
          const one = offered.find((language) => language.languageId === id);
          return one ? (one.rare ? t('{language} (rare)', { language: one.name }) : one.name) : id;
        }}
        onChange={(languages) => {
          update({ languages });
        }}
      />
      <p className="muted builder-note">
        {t(
          rogue
            ? 'Two from the standard languages and one of either table; a Rogue also knows Thieves’ Cant.'
            : draft.classId === 'druid'
              ? 'Two from the standard languages; a Druid also knows Druidic.'
              : 'Two from the standard languages.',
        )}
      </p>
      <Problems problems={builder.problemsOf('languages')} />
    </>
  );
}
