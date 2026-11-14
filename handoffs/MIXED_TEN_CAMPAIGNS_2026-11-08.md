# Checkpoint Handoff — десять дополнительных кампаний

- Gate: локальная поставка авторских кампаний; не новый номерной этап продукта.
- Type: INITIAL.
- Completed stage: запрос владельца от 2026-11-08, ten additional genre campaigns, 3–7 players.
- Revision/commit: рабочее дерево без нового коммита; базовый HEAD при начале задачи `e69c3290ca34cbde4a837591bfb477b899581142`.
- Prior report / remediation / retest: N/A; промежуточные редакционные проверки сохранены в evidence.
- Report path: [MIXED_TEN_CAMPAIGNS_2026-11-08.md](../reports/MIXED_TEN_CAMPAIGNS_2026-11-08.md).
- Session model: родительская сессия Codex для интеграции; десять отдельных авторов с запрошенными `gpt-6-astra` / `max`.
- Approved design: прямой запрос владельца в этой сессии, включая оригинальность и регулярное чтение соседних сессий;
  scope в [work order](../work-orders/MIXED_TEN_CAMPAIGNS_2026-11-08.md).
- Dirty-file hashes / package identity: [artifact-manifest.json](../reports/evidence/mixed-ten-2026-11-08/artifact-manifest.json)
  и [SHA-256 манифеста](../reports/evidence/mixed-ten-2026-11-08/artifact-manifest.sha256).
- Status: AWAITING_OWNER_DISPOSITION; технический объём завершён, человеческая приёмка не предполагается.

## Objective

Передать десять различающихся по причинам конфликта и действиям игроков русских кампаний,
каждую для любого состава 3–7 плюс ведущий, с восемью вечерами и готовыми материалами.
Восемь историй предназначены для смешанных подростково-взрослых столов. Сохранить
изоляцию знаний и власть World Engine; не подменять подготовленные сцены сыгранными исходами.

## Authoritative Documents

- [ARCHITECTURE_INVARIANTS.md](../ARCHITECTURE_INVARIANTS.md).
- [AGENT_WORKFLOW.md](../AGENT_WORKFLOW.md).
- [docs/PROJECT_WORKFLOW.md](../docs/PROJECT_WORKFLOW.md), раздел этой задачи.
- [work order](../work-orders/MIXED_TEN_CAMPAIGNS_2026-11-08.md).
- [CONTENT_CONTRACT.md](../scripts/mixed-campaigns/CONTENT_CONTRACT.md).
- [ORIGINALITY.md](../campaigns/mixed-ages-2026/ORIGINALITY.md).

## Surfaces to Attack

- API/routes: новые маршруты и runtime-контракты не добавлены; live-API и пользовательские миры не изменялись.
- CLI/test harness: `scripts/mixed-campaigns/`; канонический компилятор, изолированное состояние World Engine.
- UI: [локальный каталог](../campaigns/mixed-ages-2026/index.html), книги ведущего, игроков, вечера, раздатки и карты.
- Logs/traces: [evidence](../reports/evidence/mixed-ten-2026-11-08/AGENTS.md), unit JSON, source/variant hashes, layout results и снимки.

## Start / Reproduce

Из корня репозитория:

```sh
node --conditions=@ltw/source scripts/mixed-campaigns/build.ts
node --conditions=@ltw/source scripts/mixed-campaigns/render.ts
node --conditions=@ltw/source scripts/mixed-campaigns/verify-artifacts.ts
pnpm exec vitest run --project unit scripts/mixed-campaigns
pnpm exec tsc -p scripts/mixed-campaigns/tsconfig.json
pnpm exec eslint scripts/mixed-campaigns --max-warnings=0
pnpm context-budget
node --conditions=@ltw/source scripts/mixed-campaigns/audit.ts
```

Открыть `campaigns/mixed-ages-2026/index.html` локально. Игрокам передавать самостоятельный
`players.html` и только открытые раздатки. `package.json` рассчитан на четырёх игроков;
остальные составы лежат в `variants/`. Реальный импорт и запуск остаются действиями ведущего.

## Test Personas / Scopes

Тестовые DM, PLAYER/PARTY и каждый NPC работают на синтетических идентификаторах и состоянии
в памяти. Команды назначают героя тестовому игроку штатным образом. Production credentials,
пользовательские сессии, реальные приглашения и DB seed не используются.

## Canonical Secret or Invariant Under Test

Правда мира и возможные развязки остаются в DM/WORLD_TRUTH. NPC получает собственное
свидетельство и частное знание; чужая закрытая запись не становится доступной. Начальные
пакеты не содержат будущих воспоминаний, начатых столкновений и заранее обнаруженных улик.
Осмотр места не означает победу или согласие персонажа. Самостоятельные материалы игроков
не содержат правды ведущего и условий выдачи раздаток.

## Validation Run

| Проверка                              | Результат                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------------- |
| Источники и 50 вариантов              | READY для всех составов 3–7.                                                        |
| Соответствие артефактов               | 291 производный файл; 90 исходных и 50 вариантных хешей; PASS.                      |
| Нативные проверки                     | 80/80 PASS; включая все 155 улик и границы 95 NPC.                                  |
| Scoped TypeScript / ESLint / Prettier | PASS.                                                                               |
| Context budget                        | 0 файлов сверх целевого или жёсткого предела.                                       |
| Локальные страницы                    | 200 HTML, 1176 ссылок, 800 измерений на четырёх ширинах; 0 findings/axe violations. |
| Визуальные снимки                     | 36 просмотренных представлений общих шаблонов; светлая тема.                        |
| Сюжетная сверка                       | 40 соседних миров плюс три семейных источника; конкретные пересечения переработаны. |

## Coverage Ledger

Это локальная поставка материалов, не новый runtime-gate по `docs/GATE_COVERAGE.md`.
Покрыты авторские ссылки, составы, начальное состояние, открытие улик, области знания,
производные книги и карты, локальные ссылки, адаптивная вёрстка и ограниченный axe-аудит.
Live-импорт/активация, действующие API, внешние провайдеры, печать/PDF, человеческая игра
и будущие изменения соседних историй не аттестованы этой поставкой.

## Adversarial Pass

Проверены неверные ссылки, зависимость от отсутствующего седьмого героя, пропавший запасной
путь к улике, неподдерживаемые составы и обход каталога через имя раздатки. Источники
отвергают эти входы. Проверка хешей и точного рендера выявляет устаревшие варианты/книги;
лишние старые раздатки и карты не допускаются.

Редакционно разобраны игра втроём, отказ от боя и интервью, раннее раскрытие обмана,
частичные финалы, отказ от романтики, право пасовать, границы доказанного и знания NPC.
Исправлены дождевые события из будущего и позднее сходство радиотриллера с `absent-voters`.
Мобильные карты получили видимый край прокрутки; полный повторный аудит прошёл.

## Known Limitations

Живой плейтест и человеческая приёмка не проводились. Баланс и длительность — авторские
оценки. Сюжетные проверки и большинство последствий разрешает ведущий; это не автоматическое
прохождение восьми вечеров. Общие фоновые изменения других сессий сохранены; полный
`pnpm validate` с миграциями, seed и E2E не запускался. Точная граница проверок дана в отчёте.

## Required Output

Отчёт и проверенные артефакты переданы. **PASS в согласованном локальном объёме.**
Дальнейшая активация, публикация или новый этап не начаты; ожидается решение владельца.
