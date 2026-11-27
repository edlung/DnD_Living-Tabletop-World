/**
 * The story's own preparation on a campaign's HTML pages for the DM (docs/CAMPAIGN_TEXT_STANDARD.md
 * §9–12): what follows each choice of a scene, a person's ready lines, an ending's epilogue to read
 * aloud, and the turns of the story with what to plant in which evening. Only DM pages call these
 * renderers — never the players' page, a handout or a package.
 */

const escape = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const paragraphs = (text: string) =>
  text
    .split(/\n+/u)
    .filter((line) => line.trim() !== '')
    .map((line) => `<p>${escape(line)}</p>`)
    .join('');

export interface StoryLine {
  readonly when: string;
  readonly say: string;
}
export interface StorySeed {
  readonly session: number;
  readonly text: string;
}
export interface StoryTwist {
  readonly title: string;
  readonly turn: string;
  readonly seeds: readonly StorySeed[];
  readonly reveal: StorySeed;
  readonly after: string;
}

/**
 * A scene's choices under its heading; with forks (one a choice, in order), each choice is
 * followed by what comes of it. Without them — or when they do not match — the plain list.
 */
export function choicesHtml(
  heading: string,
  choices: readonly string[],
  forks?: readonly string[],
): string {
  if (choices.length === 0) return '';
  if (forks === undefined || forks.length !== choices.length)
    return `<h3>${escape(heading)}</h3><ul>${choices.map((c) => `<li>${escape(c)}</li>`).join('')}</ul>`;
  const items = choices
    .map(
      (choice, i) =>
        `<li><p><strong>${escape(choice)}</strong></p><p class="fork">${escape(forks[i] ?? '')}</p></li>`,
    )
    .join('');
  return `<h3>${escape(heading)} — и что будет дальше</h3><ul class="forks" data-forks>${items}</ul>`;
}

/** A person's ready lines for the DM: the situation, then the words. */
export function linesHtml(lines: readonly StoryLine[] | undefined): string {
  if (!lines || lines.length === 0) return '';
  return `<h3>Что говорит</h3><div class="lines" data-lines>${lines
    .map((line) => `<p><strong>${escape(line.when)}.</strong> ${escape(line.say)}</p>`)
    .join('')}</div>`;
}

/** An ending's epilogue, read aloud when the table reaches it. */
export function epilogueHtml(epilogue: string | undefined): string {
  if (epilogue === undefined || epilogue.trim() === '') return '';
  return `<h4>Эпилог — читать вслух</h4><div class="read-aloud" data-epilogue>${paragraphs(epilogue)}</div>`;
}

/** Every turn of the story for the DM's book: what flips, where it is planted, when it comes out. */
export function twistsSection(twists: readonly StoryTwist[] | undefined, heading = 'h2'): string {
  if (!twists || twists.length === 0) return '';
  const body = twists
    .map(
      (twist) =>
        `<article class="twist"><h3>${escape(twist.title)}</h3>${paragraphs(twist.turn)}<h4>Что посеять</h4><ul>${twist.seeds
          .map((seed) => `<li><strong>Вечер ${seed.session}.</strong> ${escape(seed.text)}</li>`)
          .join(
            '',
          )}</ul><h4>Поворот — вечер ${twist.reveal.session}</h4>${paragraphs(twist.reveal.text)}<h4>Что меняется после</h4>${paragraphs(twist.after)}</article>`,
    )
    .join('');
  return `<section class="panel section" data-twists><${heading}>Повороты сюжета</${heading}><p>Только для ведущего. Сюжетные повороты держатся на мелочах, замеченных заранее: посейте их в названные вечера, а раскрытие отдайте героям, если они догадались раньше.</p>${body}</section>`;
}

/** The turns of the story an evening plants or reveals, for that evening's page. */
export function twistsForSession(
  twists: readonly StoryTwist[] | undefined,
  session: number,
): string {
  if (!twists || twists.length === 0) return '';
  const seeds = twists.flatMap((twist) =>
    twist.seeds
      .filter((seed) => seed.session === session)
      .map((seed) => `<li><strong>${escape(twist.title)}.</strong> ${escape(seed.text)}</li>`),
  );
  const turns = twists
    .filter((twist) => twist.reveal.session === session)
    .map(
      (twist) =>
        `<h3>Поворот: ${escape(twist.title)}</h3>${paragraphs(twist.turn)}${paragraphs(twist.reveal.text)}<p><strong>После него:</strong> ${escape(twist.after)}</p>`,
    );
  if (seeds.length === 0 && turns.length === 0) return '';
  return `<section class="panel section" data-twists-session><h2>Повороты сюжета в этот вечер</h2>${
    seeds.length > 0 ? `<h3>Посеять сегодня</h3><ul>${seeds.join('')}</ul>` : ''
  }${turns.join('')}</section>`;
}
