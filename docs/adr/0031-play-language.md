# 0031. Play language: a campaign speaks one language

- Status: Accepted (owner decisions of 2026-10-05 recorded below; technical design by the builder)
- Date: 2026-10-05
- Stage: 290
- Decision type: product (language of play, glossary, grammar policy) and technical (how language enters history).
- Owner approval: on 2026-10-05 the owner decided that the alpha is played in Russian
  (`docs/IMPLEMENTATION_PREREQUISITES.md` Q7), chose **transliterated names** for the glossary,
  and chose **formulations without declension** for proper names, including names the DM authors
  in play. The owner's choices were the recommended options in both cases.

## Context

Ravenford content, client text, and the sentences the domain records into events are English.
`packages/domain` writes memory summaries and Chronicle entries as English templates; the
Chronicle hedging rule and memory recall are lexical and English-only; the offline interpreter
reads English phrasings. Events are immutable history (ADR 0006/0007): whatever language they
hold, replay must reproduce it exactly, and histories earlier revisions wrote must keep loading.

## Decisions

1. **A campaign has one play language**, `en` or `ru`. `CreateCampaign` takes an optional
   `language`; `CampaignCreated` records it (additive, so the event keeps its version);
   `CampaignState.language` is `en` when the field is absent. It never changes after creation.
   Every history written before this ADR therefore reads as English, unchanged.
2. **Recorded text is written once, in the campaign language, at decision time.** A decision that
   records a sentence (a memory summary, an insight statement, a contradiction explanation, a
   Chronicle entry) selects its wording from the campaign's language and stores the result in the
   event. Replay folds stored text and never regenerates it, so editing a template can never
   change history. Re-decision (the oracle) uses the same campaign language and therefore the
   same wording.
3. **The catalog** lives in `packages/domain/src/language/`: pure functions per area that take
   the language and the already-resolved values (names, statements) and return text. Contracts
   carry the `Language` type and the `language` on the session view. No other package imports
   the catalog; the client has its own dictionary because it must not import the domain.
4. **Glossary (owner-approved: transliteration).** Proper names are transliterated and stay the
   same in every sentence: Равенфорд, Мира Вейл, Орин Стоунберд, капитан Торн, Эловен
   Старвиспер, «Золотой Олень», Рыночная площадь, Старая Торговая дорога, Северные ворота,
   Торговая гильдия, Пепельный круг. The glossary is `fixtures/ravenford-ru/GLOSSARY.md`; a name
   the DM authors in play is used as typed.
5. **Grammar policy (owner-approved: no declension).** Templates place a name only in the
   nominative and avoid forms that agree with a person's gender or number. Sentences are built as
   label–value or noun phrases: «Беседа. Говорит: Мира Вейл. Слушает: Эловен Старвиспер. Тема:
   Торговая гильдия». No inflection library is used; a new name cannot produce a wrong case.
6. **What stays English in both languages:** identifiers, command and event type names, error and
   rejection codes and their developer messages, log lines, and trace field names. The client
   translates codes into wording; it never shows a developer message.
7. **Language-dependent rules get Russian equivalents with the same guarantees.** The Chronicle
   hedging rule recognises Russian attribution and uncertainty words by stem; lexical memory
   recall matches Russian word forms by a bounded stemmer. English behaviour, and every reviewed
   English test, are unchanged. These two are boundaries Gates 02 and 05 reviewed: Stage 290
   changes them and Gate 06 reviews the change (`docs/GATE_COVERAGE.md`).
8. **AI.** Every prompt states the campaign language for the output. The offline interpreter
   understands a documented list of Russian phrasings and otherwise degrades as ADR 0017
   requires. Live-model quality in Russian is measured in Stage 300.
9. **Seed.** `fixtures/ravenford-ru/` mirrors `fixtures/ravenford/` with Russian content, the
   same entity and knowledge IDs, and `language: "ru"`. Boundary specifications gain Russian
   markers; a boundary test passes only if it checks both the English and the Russian marker.
10. **Client.** The session response names the campaign language; the client selects its
    dictionary from it. Dictionary keys are the English source strings, so an English client
    reads the code as before; a test fails when a string used in the client has no Russian entry.

## Consequences

- Earlier histories, fixtures, and tests are untouched; English remains the default.
- Wording is fixed at write time: improving a Russian template changes only new events.
- A mixed-language campaign is not supported. Changing a campaign's language means a new campaign.
- Declension-free wording reads stiffly in places; a later stage may add inflection if playtests
  call for it (a new decision).
