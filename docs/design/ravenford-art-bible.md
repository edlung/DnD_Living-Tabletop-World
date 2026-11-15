# Арт-библия вселенной Ravenford

Версия 1, 2026-11-15. Правила для всех новых картинок мира Ravenford: город, Северные топи
(Hollowmere) и каждое следующее приключение этой вселенной. Цель — чтобы новые картинки нельзя было
отличить от уже отгруженных.

- **Основа.** ADR 0034 (визуальный язык, концепты владельца) и ADR 0035 (картинки, curated-набор).
  Эталон стиля — концепты владельца `docs/design/stage-320/owner-concepts/` и curated-набор Ravenford
  `fixtures/ravenford-ru/assets/`.
- **Вне сферы.** Кампании библиотеки (`campaigns/*`) — отдельные миры со своим `style.txt`; эта
  библиотека на них не распространяется.
- **Происхождение.** Каждая картинка делается моделью изображений OpenAI (правило владельца от
  2026-10-15). Руками и кодом рисуется только игровая разметка поверх: сетка, кольца, подписи.
- **Две копии стиля.** Стиль живёт здесь и в `apps/server/src/images/style.ts` (`STYLE_PROMPT`,
  кадры, варианты — копия для генерации в игре). Меняя одну, меняйте и другую.
- **Решения владельца 2026-11-15.** Гоблины — два племени (§7). День — только вариант, база места —
  вечерний тёплый свет (§3).

## 1. Стиль в одном абзаце

Премиальная кинематографичная тёмная фэнтези-живопись уровня ключевого арта AAA-RPG. Богатая
живописная детализация, правдоподобные материалы (мокрый камень, просмолённое дерево, тусклая кожа,
патина бронзы). Тёплый янтарный свет фонарей и свечей против холодных синих теней, приглушённое
золото, лёгкая атмосферная дымка. Мир обжитой и старый, без глянца: всё потёрто, заштопано, ржавеет.
Магия — редкое холодное свечение (бирюза, бледный лунный свет), не фейерверк.

## 2. Палитра

| Роль          | Цвет                                              | Где                               |
| ------------- | ------------------------------------------------- | --------------------------------- |
| Глубокая тень | ночная синева и уголь, ≈ `#05090e`–`#0e1620`      | фон портретов, края мест          |
| Тёплый ключ   | янтарь фонаря и свечи                             | окна, огонь, лица                 |
| Металл        | приглушённое старое золото, ≈ `#8a6a33`–`#e6c784` | доспех, оправы, бронза            |
| Магия, холод  | бирюза-циан ≈ `#46c0dc`, бледный лунный           | заклинания, нежить, болотные огни |
| Акцент        | угольно-красный, тлеющий                          | кровь (без гора), угли, лента     |
| Природа       | приглушённые оливковые и мшистые зелёные          | плащи, топь, лес                  |

Нельзя: розовый и маджента, кислотные неоновые цвета, плоская серая гамма без тёплого источника,
чистый белый день без теней. Фиолетовый — только для магии в интерфейсе (`--magic`), не в мире.

**Измеримые ориентиры.** Получены замером 66 отгруженных картинок мира Ravenford и Hollowmere (без
фигурок и карт; кадр 160 px; доли
пикселей с насыщенностью и яркостью > 0,3: янтарь — оттенок 15–55°, синий — 200–250°, бирюза —
165–200°). Картинка, которая выпадает из ориентира, — повод посмотреть на неё глазами, а не
автоматический брак.

| Назначение                | Ориентир (весь канон Ravenford в него укладывается)                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| База места                | средняя насыщенность ≥ 30 %; тёмных пикселей (яркость < 0,18) ≥ 5 %; янтарь + синий + бирюза ≥ 10 % |
| Портрет, бестиарий        | тёмных ≥ 30 %; янтарь + синий + бирюза ≥ 8 %                                                        |
| Вариант «день»            | средняя насыщенность ≥ 35 % (серые дни Hollowmere давали 16–33 %); тёплый солнечный свет и тени     |
| Вариант «ночь»            | средняя светлота ≤ 55 из 255; синего ≥ 7 %                                                          |
| Варианты «дождь», «туман» | насыщенность может падать до 15 %; темнота и тёплый источник не обязательны                         |

## 3. Свет и время суток

- **База места — вечер.** Золотой час, сумерки или вечер в янтарно-синей гамме: тёплые окна и
  фонари, длинные тени, небо от янтаря до синевы.
- **День — только вариант** (`--day`, `--dawn`), в тёплом солнечном свете с ясными тенями и глубокими тонами. Плоский
  серый день не используется ни в базе, ни в варианте.
- **Портреты и бестиарий** — тёмный фон, уходящий почти в чёрный; один тёплый ключевой свет; у нежити
  и магических существ допустим холодный ключ.
- **Исключение 1: боевые карты.** Ровный мягкий свет сверху, иначе фишки не читаются; палитра и
  материалы при этом из §2.
- **Исключение 2: Рыночная площадь Ravenford.** Её база утренняя (отгружена 2026-10-15). Она остаётся
  как есть; новую вечернюю базу делать только по решению владельца.

## 4. Назначения и кадр

Фразы ниже — канонические, в промпт они идут дословно.

| Назначение                     | Кадр (FRAMING)                                                                                                                                                                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Портрет человека / NPC / героя | `square 1:1 portrait, head and shoulders to mid-chest, three-quarter view, soft cinematic key light, dark atmospheric background that falls off to near-black at the edges`                                                                                       |
| Бестиарий (существо)           | `square 1:1 bestiary portrait, the whole creature or head and shoulders, three-quarter view, dramatic rim light on a dark smoky background with a soft vignette; an original design, not any known franchise creature`                                            |
| Место                          | `wide 3:2 landscape establishing view at eye level; keep the lower third calm and uncluttered (open ground or cobblestones) so interface elements can sit there; no identifiable people — at most a few tiny distant anonymous silhouettes far in the background` |
| Объект, улика                  | `square 1:1 close view of the object where it lies, soft natural light, shallow depth of field`                                                                                                                                                                   |
| Фигурка (от эталона)           | `full-body painted tabletop miniature of the same character standing on a round dark stone base, three-quarter view from slightly above, isolated on a pure flat black background (#000000), no cast shadow beyond the base`                                      |
| Боевая карта                   | §8.3: строго сверху, по раскладке сетки боя                                                                                                                                                                                                                       |
| Карта региона                  | `a painted fantasy regional map seen straight from above, like an illustrated parchment map without any lettering` + что где лежит словами (образец — `fenlands`)                                                                                                 |

Пропорции: портрет, бестиарий, объект и фигурка — 1:1; место — 3:2; боевая карта — по сетке боя
(отношение сторон ≥ 1,25 → 3:2, ≤ 0,8 → 2:3, иначе 1:1). Обработка механическая: WebP не больше
1536 px; у фигурки чёрный фон уходит в альфу; боевая карта режется по полю боя.

## 5. Варианты

Вариант рисуется **только от одобренного эталона**: эталон прикладывается к запросу и добавляется
фраза `The attached image is the approved canonical reference. Draw the same <place|person> <variant>.
Keep the same place's architecture and composition or the same person's face, hair, build and clothing
exactly; change only what this variant requires.`

| Метка                       | Формулировка                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `night`                     | at night: deep blue darkness, moonlight and warm lantern glows                                                                                                      |
| `rain`                      | in steady rain: wet ground and puddles, rain streaks, grey overcast light                                                                                           |
| `night-rain`                | at night in steady rain: lantern glows reflected in puddles, rain streaks                                                                                           |
| `fog`                       | in thick fog: shapes fading into pale mist                                                                                                                          |
| `dusk` / `dawn` / `day`     | at dusk: low amber light and long shadows / at dawn: low pink-gold light / in warm daylight: soft golden sun, clear shadows and deep rich tones, never flat or grey |
| `snow`, `storm`, `overcast` | как в `style.ts`                                                                                                                                                    |
| `wounded`                   | wounded but standing: torn clothing, a bandage, a cut on the brow, tired but resolute                                                                               |
| `figure`                    | фраза фигурки из §4                                                                                                                                                 |

Минимальный набор для нового места: база + `night`. Для места, куда возвращаются часто, ещё `rain`
или `fog` (по климату региона: в топях — туман). Для героя и врага в бою: портрет + `figure`; для
повторяющегося NPC и героя — ещё `wounded`.

## 6. Запреты (в каждый промпт)

- `Absolutely no text, letters, numbers, runes that read as letters, logos, interface, borders or
watermarks.` Вывески, знамёна и печати — `without lettering` / `without emblems`.
- На картинке нет ничего, что игроки должны заработать: улики, скрытые детали, лица злодеев до
  раскрытия. Улику описывать так, чтобы она `means nothing at a glance`.
- Никаких узнаваемых франшиз: ни существ, ни символики, ни брендов (в концептах есть «D&D NEXT» — не
  копировать).
- Без гора: раны — бинты и порезы, смерть — `lying still, eyes closed, no gore`.
- На месте нет узнаваемых людей — только крошечные далёкие силуэты.
- Из концептов не брать интерфейсные панели, подписи и текст: концепт — только стиль, а для
  названных персонажей и мест ещё и внешность.

## 7. Канон лиц и существ (модельные листы)

Описание внешности повторяется дословно в каждом новом запросе с этим персонажем, а его одобренный
портрет прикладывается как эталон. Менять приметы можно только сюжетом (шрам, новая одежда), и
тогда фиксировать их здесь.

### Ravenford

| Кто               | Канон (SUBJECT)                                                                                                                                                             | Эталон                    |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Эловен Старвиспер | elven ranger and wizard: long platinum-blonde hair, pointed ears, calm grey-green eyes, a dark green hooded travelling cloak over fitted dark leather armour, a longbow     | `elowen-starwhisper.webp` |
| Мира Вейл         | human market trader in her thirties: warm brown hair braided back, friendly but watchful face, a dark green bodice over a cream blouse, a small coin purse at her belt      | `mira-vale.webp`          |
| Орин Стоунберд    | elderly dwarf alchemist: a great braided red-grey beard, brass goggles pushed up on his forehead, a stained leather apron over a dark shirt, grumpy and cautious expression | `orin-stonebeard.webp`    |
| Капитан Торн      | human man in his forties: short dark hair and a trimmed beard, a steel cuirass over a dark guard tabard without emblems, a composed, unreadable expression                  | `captain-thorne.webp`     |

### Северные топи (Hollowmere)

| Кто                 | Канон (SUBJECT)                                                                                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Агна Бриск          | human widow in her fifties: sharp grey eyes, grey hair pinned under a dark kerchief, a dark wool coat, ink on her fingers, a brisk no-nonsense expression                     |
| Хобб Фенвик         | heavy, tired human village reeve in his forties: stubble, bags under his eyes, a stained leather jerkin and a plain brass chain of office                                     |
| Сестра Ильзе        | lean human priestess in her sixties: sharp eyes, a grey wimple, a simple dark habit, a small bronze bell on a cord at her neck                                                |
| Керра Рид           | weathered human ferrywoman in her thirties: dark braided hair, a cloak of woven reeds, a boat-hook over her shoulder, a guarded wry look                                      |
| Старый Маттис       | very old human bell-ringer: a long white beard, a frayed brown coat, kind tired eyes, one hand cupped at his ear                                                              |
| Фонарщик в капюшоне | gaunt hooded figure in a grey robe whose face is hidden in deep shadow, holding up a black iron lantern with a perfectly steady pale flame; a ring of ash smeared on the hood |

### Народы и существа

- **Гоблины — два племени с общей основой.** Основа у всех гоблинов вселенной: `a small wiry
grey-green goblin with long pointed ears and sharp teeth, a notched short blade`.
  - **Дорожные (Старая торговая дорога, Ravenford):** `crude patched leather armour … a battered round
wooden shield`; шаман — `ragged hide robes hung with bone charms, a staff topped with a bone fetish`.
    Эталоны: `goblin-raider.webp`, `goblin-shaman.webp`.
  - **Болотные (Северные топи):** `wearing a stolen sheepskin`. Эталон: `fixtures/hollowmere/assets/goblin-raider.webp`.
  - Новое племя — та же основа плюс одна-две приметы снаряжения своего края.
- **Reed Cloaks** (контрабандисты топей): `a cloak of woven reeds`; у контрабандиста — короткий клинок
  и лёгкий арбалет. Дозорный (ещё не нарисован; по сиду — зоркий лучник на балках мельницы):
  тот же плащ, длинный лук и короткий меч.
- **Ashen Circle** (культ): серые робы и кольцо пепла на капюшоне или лбу — общий знак и у
  аколитов, и у Фонарщика.
- **Нежить топей:** вода, тина, позеленевшая медь; холодный синий свет в глазницах только у сильной
  нежити (Утонувший рыцарь).
- **Новые существа** — по описанию SRD, без франшизных дизайнов; если существо уже есть в каноне, его
  портрет прикладывается как эталон.

## 8. Как генерировать

### 8.1. Эталоны (прикладываются к каждому запросу)

| Группа              | Эталоны стиля                                                                                                      | Не брать в эталоны                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Человек, NPC, герой | `mira-vale`, `orin-stonebeard` (их же берёт `style-references.ts`), для героя — `elowen-starwhisper`               | —                                                                               |
| Существо            | `goblin-shaman`, `fixtures/hollowmere/assets/drowned-knight`                                                       | —                                                                               |
| Место               | `market-square`, `golden-stag-inn` (как в игре), для ночи и болот — `north-gate--night`, `fogmarsh`, `sunken-mill` | `hollowmere`, `mill-road`, `willow-ford`, `drowned-chapel` (плоский серый день) |
| Объект              | `broken-wagon-wheel`, `goblin-weapon`                                                                              | —                                                                               |
| Фигурка             | `elowen-starwhisper--figure`, `goblin-raider--figure`                                                              | —                                                                               |
| Боевая карта        | `old-trade-road--map` + эталон самого места                                                                        | —                                                                               |

Плюс 1–2 концепта владельца (`02-four-screens`, `06-combat-states` для людей; `04-dm-creates-a-place`,
`05-combat-bridge` для мест). Hollowmere рисовали только по концептам, без эталонов Ravenford, — так
и появился дрейф. Не повторять.

### 8.2. Шаблон запроса (Codex CLI, подписка ChatGPT владельца)

```text
Create exactly one new image with your image generation tool. Do not write any code or other files except saving the result.

STYLE: match the attached reference art — premium cinematic dark-fantasy digital painting like AAA fantasy RPG key art: rich painterly detail, believable materials, warm amber lantern and candle light against cool blue shadows, burnished gold accents, gentle atmospheric haze. Use the references for style (and for the look of a character or place only where the task says so); never copy their interface panels, labels or text. Absolutely no text, letters, numbers, runes that read as letters, logos, interface, borders or watermarks.

SUBJECT: <канон из §7 или новое описание: кто/что, приметы, время суток по §3>
<NOTE: для известного персонажа — "He/She is the same … as in the attached reference; keep the face, hair and costume.">
FRAMING: <фраза из §4>

Then copy the generated PNG into the current working directory as <entity-key>[--<variant>].png and reply only with that file name.
```

```bash
CODEX_HOME=~/.codex-review-cli codex exec --skip-git-repo-check -s workspace-write -i <ref1.webp> -i <ref2.webp> - < prompt.txt
```

Одна картинка — около 2 минут. Имя файла — ключ сущности, вариант через `--` (`north-gate--night`).

### 8.3. Боевая карта

Рецепт тот же, что у библиотеки кампаний (`~/Documents/living-tabletop-world-art/battle-maps-2026-11-14/`
`prep.mjs`, `gen.sh`). Первый эталон — раскладка поля боя: сетка `width × height` из
`encounters.json` в центре холста. Тёмные клетки — сплошное препятствие или полное укрытие, серые —
низкое укрытие, штриховка — трудная местность. Второй эталон — одобренная картинка места. В промпт
идут: `seen straight from above (orthographic top-down)`, «препятствия ровно на этих клетках, размером
в клетку», `No grid lines, no people, no creatures, no figures, no text… Even soft light from above so
the ground reads clearly under game tokens`, затем STYLE из §8.2. Карта обрезается по полю.

### 8.4. Путь в продукт

1. Оригиналы PNG — только вне репозитория: `~/Documents/living-tabletop-world-art/<набор>-<дата>/`
   (`originals/`, `manifest.json` с промптами и эталонами, лог).
2. Сборка: `node scripts/curated-set/cli.ts <originals> <generation-manifest.json> <fixtures/…/assets>`
   — WebP, SHA-256 файла и оригинала, промпт, эталоны, `derivedFrom`.
3. В манифесте `entityIds` перечисляют **каждую** сущность, которая показывает картинку: все
   экземпляры врага в бою, а не один.
4. Сверка лиц: вариант и фигурка против эталона (`reports/STAGE_330_IDENTITY.md`).
5. Изменение уже отгруженных байтов — только с одобрения владельца.

## 9. Приёмка картинки

- [ ] Стиль: тёплый источник света, глубокие тени, материалы, дымка; рядом с эталонами не выделяется.
- [ ] Ориентиры §2 выполнены или отклонение осознанное (туман, магическое существо).
- [ ] Свет по §3: база места — вечер; день — только вариант.
- [ ] Кадр по §4; у места нижняя треть спокойная; у фигурки подставка и чистый чёрный фон.
- [ ] Лицо и костюм совпадают с §7 и эталоном; у гоблинов — основа плюс приметы племени.
- [ ] Нет текста, рун-букв, эмблем, франшиз, гора, лишних людей.
- [ ] Не раскрыто то, что игроки должны найти сами.
- [ ] Манифест: промпт, эталоны, SHA-256; `entityIds` покрывают всех, кому картинка нужна.

## 10. Интерфейсный арт (UI-kit)

Это отдельный класс картинок: глифы, текстуры, орнаменты, каталог. Об устройстве мира он ничего не
говорит и никогда не заменяет картинку мира. Стиль задан в `apps/web/src/assets/ui-kit.manifest.json`:
ночная синева и уголь, янтарный свет, старое золото, акценты светящейся бирюзы и тлеющего красного.
Предметы — на тёмном фоне; глифы — белые линии на чёрном, потом маска. Сборка —
`node scripts/ui-kit/cli.ts`. Для новых иконок каталога (бестиарий SRD, заклинания, предметы)
действуют §2 и §6 этой библии; эталоны — `catalog/kinds/*` и `catalog/items/*`.

## 11. Что из отгруженного расходилось с библией

По §2–3 и замеру. Исправлено 2026-11-15 (`reports/RAVENFORD_ART_P1_P2_2026-11-15.md`).

| Картинка                                                                             | Было                                | Сделано                                                                                                                        |
| ------------------------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `hollowmere/hollowmere`, `mill-road`, `willow-ford`, `drowned-chapel`, `reeves-hall` | дневная или серая база, слабые тени | новая вечерняя база поверх прежней картинки (архитектура сохранена); прежние оригиналы — в `ravenford-p1-2026-11-15/replaced/` |
| места Hollowmere                                                                     | нет вариантов                       | `day` (тёплый), `night`, `fog` для ключевых мест; `day` у ночных баз топи и мельницы                                           |
| `ravenford-ru/market-square`                                                         | база утренняя                       | оставлена (§3, исключение 2)                                                                                                   |
| `ui-kit/catalog/kinds/school-enchantment`                                            | розово-маджентовое сердце           | перерисована в палитре                                                                                                         |
