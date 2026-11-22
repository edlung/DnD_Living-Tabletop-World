# Stage 910 completion — the book's data

Work order `work-orders/STAGE_910.md`; program `docs/DM_BOOK_PLAN.md` (section 910); ADR 0074 §2;
2026-11-22. Status: **implemented, the program continues** (the owner chose Stages 900–930 without
stops). Branch `claude/stage-910-book-data`, stacked on Stage 900's
(https://github.com/edlung/DnD_Living-Tabletop-World/pull/73).

**On whose word.** The owner's of 2026-11-22 (`reviews/OWNER_DM_BOOK_2026-11-22.json`). Every
design point of this stage is the session's (ADR 0074 §2) and stays his to overrule.

## What changed

- **Every one of the 53 campaigns has its book**: `fixtures/campaign-library/<id>/book.json`,
  built by the library's build from the campaign's `source/`. 53 books, 434 chapters, 1,323
  pages, 517 people, 804 clues, 467 handouts; 9.2 MB in all, the largest 252 KB.
- **A page is the source's scene, word for word.** The build adds only what it can read from the
  text: the check as fields (1,137 lines read, 63 say "no roll", 123 left as written), the people
  named in the page (1,250 pages have a link, 3,117 links), whom the text speaks to (1,284 pages
  speak to the DM, 39 can be read aloud), the chapter of each prepared encounter (166 of 175
  tied, 9 listed loose).
- **The contract** `packages/contracts/src/campaign/book.ts` and its reference check
  `bookReferenceProblems`.
- **The server's library loader** reads and verifies each book (`bookFor`, by the active
  revision's digest, as pictures are found). No route yet: that is Stage 920.
- **The two built-in adventures have books**, closed until the owner has read them
  (`awaitingReading`): Hollowmere's eight pages are the second concept's spreads as written
  there; Ravenford's six pages are new and quoted in full below.
- **The library test's timeout is gone**: the one test that compares all 53 campaigns has two
  minutes instead of the default five seconds (it failed under full-suite load on pull request
  72's tree).

## Changed against the plan

The plan and the work order said "the package gains an optional `book`". Measured before writing
it: a package may be 512 KB at most, the largest shipped one is 453 KB, a book is 175 KB on average
and would repeat in each of a campaign's four to seven packages. The book became a document beside
the packages (ADR 0074 §2.1; plan decision 15). Because of that no package, no digest and no
series build changed — the diff of this stage in `fixtures/campaign-library/` is 53 new
`book.json` files and one new field in each `library.json`. The plan, the work order and the ADR
say so.

Second change: Hollowmere's book also waits for the owner's reading. Its text was written by a
model in another session, and the rule of 2026-11-21 («Читать всё самому») covers it; the
owner's choice in the question card named the source of the pages, not that they skip his
reading.

## For the owner's reading

Both books stay closed in the product until `awaitingReading` is removed from their fixture
(through `scripts/adventures/books/`).

- **Hollowmere** — `docs/design/dm-book/story.js` (the text) or `fixtures/hollowmere-ru/book.json`
  (as shipped). Nothing in it was rewritten.
- **Ravenford** — below, in full. The DM's note of the chapter and the four "if the party…"
  notes are the existing text of `docs/BUILTIN_ADVENTURES_DM_RU.md`; what people say and what
  the clues state are the seed's own statements; the narration, the questions and the briefs are
  new.

**Пропавший караван** — 30–45 минут

> Read aloud: Равенфорд встречает вас шумом Рыночной площади. Здесь торгуют, спорят о ценах и ждут повозок с севера. Сегодня на площади ждут слишком долго: караван Торговой гильдии так и не пришёл.

Goal (new): Узнать, что случилось с караваном Торговой гильдии, и решить, кому отряд доверит находки.

#### Слух на рынке

> На Рыночной площади пахнет горячим хлебом и мокрой шерстью. Торговцы переговариваются вполголоса, и чаще других слов слышно одно — караван.

> У своего прилавка стоит Мира Вейл. Она пересчитывает товар и то и дело смотрит в сторону Северных ворот. «Караван гильдии задерживается, — говорит она. — Ни повозок, ни вестей».

- Question for the table: С чего вы начнёте: с расспросов на площади, со стражи у ворот или сразу с дороги?
- Note for the DM: Задание никто не навязывает. Мира отвечает на то, о чём её спросили.
- **Разговор с Мирой** (opened from «Мира Вейл»): Мира дружелюбна, практична и наблюдательна. О грузе и о прошлой весне она рассказывает охотно.
  - Если спросят, когда ушёл караван: «Караван ушёл до рассвета».
  - Если спросят о грузе: Караван вёз товары для Торговой гильдии по Старой Торговой дороге.
  - Если спросят, бывало ли такое раньше: Похожий караван пропал на Старой Торговой дороге прошлой весной.

#### Заброшенная стоянка

> Старая Торговая дорога выводит к придорожной поляне. Повозки лежат на боку, ящики разбросаны по траве.

> У обочины валяется сломанное колесо. В траве блестит грубый клинок. На доске одной из повозок выжжен странный знак. От дороги на север уходят следы, а посреди поляны чернеют остатки груза.

- Question for the table: Что вы осмотрите первым и кто за это возьмётся?
- Note for the DM: Версия отряда о гоблинах неверна; пусть улики ей противоречат. «Караван атаковали гоблины» — догадка, а не установленный факт.
- **Колесо повозки** (opened from «сломанное колесо»): Сломанное колесо видно сразу. Проверка нужна тому, кто рассматривает спицы.
  - Интеллект · Анализ, СЛ 13
  - Успех: Спицы аккуратно пропилены, а не разбиты.
  - Неудача: У дороги лежит сломанное колесо повозки.
- **Гоблинский клинок** (opened from «грубый клинок»): Клинок лежит на виду. Проверка нужна тому, кто смотрит на лезвие вблизи.
  - Интеллект · Анализ, СЛ 15
  - Успех: Клинком никогда не пользовались: ни зазубрин, ни крови.
  - Неудача: В траве лежит грубый гоблинский клинок.
- **Странный знак** (opened from «странный знак»): Знак виден всем. Что он значит, на поляне узнать не у кого: связь знака с Пепельным кругом раскрывайте лишь после того, как отряд покажет его Орину.
  - Интеллект · Анализ, СЛ 14
  - Успех: Знак нарисован с тщанием, умелой рукой.
  - Неудача: На доске повозки выжжен странный знак.
- **Следы** (opened from «следы»): Попросите проверку у того, кто идёт вдоль дороги и смотрит под ноги.
  - Мудрость · Внимательность, СЛ 12
  - Успех: Тяжёлые следы сапог, слишком большие для гоблинов, ведут на север от дороги.
  - Неудача: Трава примята, но чьи это следы, не разобрать.
- **Сожжённый груз** (opened from «остатки груза»): Что часть груза сожгли на месте, видно сразу. Проверка нужна тому, кто считает ящики.
  - Интеллект · Анализ, СЛ 12
  - Успех: Сожжено лишь несколько ящиков; большая часть груза исчезла.
  - Неудача: Часть груза сожгли на месте.

#### Лавка алхимика

> В алхимической лавке тесно и пахнет серой. За прилавком стоит Орин Стоунберд. Он смотрит на вошедших и не спешит здороваться.

> «Покупать будете или спрашивать?» — ворчит он.

- Question for the table: Что вы покажете Орину и о чём промолчите?
- Note for the DM: Орин ворчлив и осторожен. О знаке он заговорит, только когда ему его покажут.
- **Разговор с Орином** (opened from «Орин Стоунберд»): Орин наблюдателен и взвешивает каждое слово. Сам он ничего не предлагает.
  - Если ему покажут знак: Орин уже видел этот знак на необычных заказах реагентов. Тот же знак он узнал после того, как прошлой весной пропал караван.
  - Если спросят о капитане Торне: Орин лично знаком с капитаном.
  - Если знак не показали: О Пепельном круге Орин не говорит. Версию о гоблинах игроки могут проверить на месте.

#### Караульня у Северных ворот

> У Северных ворот стража проверяет повозки. Капитан Торн стоит под аркой и следит за дорогой. Он прибыл в Равенфорд восемь месяцев назад и на вопросы отвечает коротко.

- Question for the table: О чём вы спросите капитана: о дороге, о времени или о его людях?
- Note for the DM: Знание о расхождении возникает, когда отряд услышал оба рассказа. Кто из двоих ошибся, книга не решает.
- **Разговор с капитаном** (opened from «Капитан Торн»): О дороге и о времени капитан говорит охотно. О патруле — только если спросят прямо.
  - Если спросят, когда ушёл караван: «Караван ушёл после восхода солнца».
  - Если спросят о дороге: Путь каравана лежал на север по Старой Торговой дороге.
  - Если спросят о страже на дороге: Стражный патруль на Старой Торговой дороге не вернулся с докладом.
- **Два времени**: Мира говорит «до рассвета», капитан — «после восхода». Расхождение само по себе никого не уличает.
  - Спросите за столом: Что могло бы объяснить оба рассказа сразу? Запишите ответ как догадку.

#### Засада на тракте

> Старая Торговая дорога сужается между брошенными повозками и канавой. Ветер стихает. Из-за бортов повозок поднимаются низкие фигуры, а из канавы выходят два серых ворга.

- Question for the table: Вы принимаете бой, отступаете или пробуете договориться?
- Note for the DM: Дайте группе назвать своё решение, прежде чем считать инициативу.
- **Засада на Старой Торговой дороге** (opened from «низкие фигуры»): Гоблины-налётчики с двумя шаманами, два серых ворга и гоблин-вожак нападают на отряд из-за повозок и из канавы. Рассчитано на весь отряд из четырёх.
  - Если группа уступила: Оставьте поляну и ящики у занявшей её стороны. У ворот возчики решают, остановить ли следующий обоз, а Мира может принять показания о пропаже.

#### Возвращение

> К вечеру Равенфорд снова шумит. На Рыночной площади зажигают фонари, и Мира Вейл закрывает прилавок. Увидев вас, она откладывает замок.

- Question for the table: Что вы расскажете и кому доверите находки?
- Note for the DM: Один финал — гильдия получила свидетельство подстроенного нападения. Другой — партия вернулась с несовместимыми показаниями и ещё ищет проверку.
- **Слово гильдии** (opened from «Мира Вейл»): Мира слушает и переспрашивает только о том, что отряд видел сам.
  - Если расследование отклонили: Покажите один день ожидания у того, кто ждёт груз.
- **Последняя строка**: Спросите игроков, что из найденного они считают установленным, а что — догадкой.
  - Для журнала: Запишите только увиденное и сообщённое. Неизвестное можно оставить открытым.

## Verification

| Check                                                                                               | Result             |
| --------------------------------------------------------------------------------------------------- | ------------------ |
| `pnpm run format:check`, `lint`, `typecheck`, `context-budget`                                      | pass (2,921 files) |
| `pnpm run test` (unit)                                                                              | pass, 5,065 tests  |
| of them new: contract 4, check reader 27, names 5, voice and encounters 8, library 109, built-ins 6 | pass               |
| `pnpm run build`                                                                                    | pass               |
| Library integration tests against PostgreSQL (two files, three tests)                               | pass               |
| The library rebuilt twice gives the same bytes (`library.test.ts`)                                  | pass               |

Not run: the whole integration suite and the browser journeys — no route, no client and no
migration changed. CI runs them on the pull request.

## Risks and what is open

- **Which live campaign gets a book.** A campaign is recognised by the digest of its active
  revision. One started from an earlier build of the library, or from a package edited before
  activation, is not recognised. Stage 920 decides what such a campaign gets (ADR 0074 §2.7).
- **123 check lines are not read as fields** (a tool, a craft, a skill in another case, a rule of
  the scene). The book shows the line; the DM asks for the roll by hand.
- **Nine encounters have no chapter** and are listed with their book.
- **The voice rule is a heuristic** that leans to the DM. The 39 pages it calls the players' were
  not read one by one.
- **People cards of the built-in adventures are thin**: a seed has a description and what the
  person knows, no "wants" and no manner of speech. The card shows what there is.

## Next

Stage 920, `work-orders/STAGE_920.md`: the DM's screen that reads these books.
