# Checkpoint Handoff — Fantasy Ten

- Gate: локальная поставка контента, без новой номерной продуктовой стадии.
- Type: INITIAL.
- Completed scope: `work-orders/FANTASY_TEN_2026-11-08.md`.
- Revision: базовый HEAD и точная идентичность артефактов — в manifest ниже; общее дерево содержит чужие изменения.
- Prior report / remediation: N/A; сюжетные исправления включены в эту поставку.
- Report: `reports/FANTASY_TEN_2026-11-08.md`.
- Session model: текущая сессия Codex собирала и проверяла; каждый из десяти авторов запрошен отдельно как `gpt-6-astra / max`.
- Approved design: прямой запрос владельца и подтверждение «продолжаем»; scope в work order. Новая архитектура не вводилась.
- Dirty-file hashes / package identity: `reports/evidence/fantasy-ten-2026-11-08/manifest.json`; авторы — `author-agents.json` рядом.
- Status: **AWAITING_OWNER_DISPOSITION**; вся работа локальной поставки завершена, человеческий плейтест не заявлен.

Manifest: `8ced26479403a4ed2e983a1206fb125e0be4a957658945fe5a347cb1dbcd117b`.
Базовый HEAD: `e69c3290ca34cbde4a837591bfb477b899581142`. Формальные отчёт и handoff
исключены из собственного manifest, чтобы не создавать циклический хеш.

## Objective

Передать десять разных фэнтези-кампаний для всех составов 3–8 плюс ведущий, с материалами
смешанного подросткового/взрослого стола, корректными нативными пакетами и локальными книгами.
Сохранить власть World Engine, отделение знаний и условность будущих событий.

## Authoritative Documents

- `ARCHITECTURE_INVARIANTS.md`.
- `AGENT_WORKFLOW.md`, `docs/PROJECT_WORKFLOW.md`, `docs/AI_CONTEXT_MAP.md`.
- `work-orders/FANTASY_TEN_2026-11-08.md`.
- `campaigns/fantasy-2026/AGENTS.md`, `scripts/fantasy-campaigns/CONTENT_CONTRACT.md`.
- `campaigns/fantasy-2026/DISTINCTNESS.md`.

## Surfaces to Attack

- API/routes: настоящий in-memory app, знания по перспективам, осмотр улик, список и запуск подготовленных встреч.
- CLI: source validator, канонический compiler/materializer, сборка 60 вариантов, сравнение исходников с 70 JSON-файлами.
- UI: 192 локальные HTML-страницы, самостоятельные player exports, раздатки, SVG-поля.
- Logs/evidence: `tests.json`, `layout.json`, `concordance.json`, `content-summary.json`, `plot-comparison.json`, `manifest.json`.

## Start / Reproduce

Из корня репозитория:

```sh
node --conditions=@ltw/source scripts/fantasy-campaigns/build.ts
node --conditions=@ltw/source scripts/fantasy-campaigns/render.ts
pnpm exec vitest run --project unit scripts/fantasy-campaigns
pnpm exec eslint scripts/fantasy-campaigns --max-warnings=0
pnpm exec tsc -p scripts/fantasy-campaigns/tsconfig.json
pnpm exec prettier --check scripts/fantasy-campaigns campaigns/fantasy-2026 work-orders/FANTASY_TEN_2026-11-08.md
pnpm context-budget
python3 scripts/fantasy-campaigns/concordance.py
node scripts/fantasy-campaigns/distinctness.ts
node scripts/fantasy-campaigns/audit.ts /Users/oleksandr/.agents/skills/ui-layout-audit/audit.mjs
```

Последний путь указывает на установленный `ui-layout-audit`; на другой машине передать
путь к его `audit.mjs`. Запуск Chromium может требовать разрешения среды. Сетевые запросы
самого аудита заблокированы. Сборка и рендер принимают slug для точечной проверки;
каталог обновляет полный рендер.

Начало для владельца: `campaigns/fantasy-2026/index.html`.
Пакет `package.json` рассчитан на четверых; для другого числа выбрать нужный `variants/N-players.json`.
Живую активацию владелец подтверждает отдельно в обычном интерфейсе.

## Test Personas / Scopes

Изолированные тестовые DM, PLAYER и outsider; подготовленные NPC получают собственную
перспективу. Проверяются составы 3 и 8 в игровом пути и все шесть размеров в компиляторе.
Учётных данных реальных людей, провайдерских ключей и данных рабочей базы в проверках нет.

## Canonical Secret or Invariant Under Test

Начальная правда мира, личные тайны NPC и закрытые раздатки не должны оказаться у игрока.
Чужие личные сведения не должны попасть в перспективу NPC. Осмотр открывает только
предусмотренную улику через разрешённое действие. Будущая подготовка не является исполненной
историей; запуск боя остаётся действием ведущего с реальными участниками в нужном месте.

## Validation Run

| Surface                                        | Result                                                         |
| ---------------------------------------------- | -------------------------------------------------------------- |
| 60 native variants                             | READY, findings отсутствуют                                    |
| 41 scoped tests                                | PASS, без пропусков                                            |
| ESLint, TypeScript, Prettier, context budget   | PASS                                                           |
| 70 packages + 191 book/handout files vs source | PASS                                                           |
| 192 pages at 1440/768/390/320                  | PASS, 768 состояний                                            |
| 28 representative screenshots                  | Просмотрены, дефектов не обнаружено                            |
| Ten author assignments                         | Отдельный агент на кампанию; запрошенная конфигурация записана |

## Coverage Ledger

Новая продуктовая стадия и новый gate из `docs/GATE_COVERAGE.md` этим контентом не открываются.
Должные для этой поставки поверхности — компиляция, изолированный игровой путь, отделение
знаний, соответствие исходников и экспортов, локальная вёрстка — проверены командами выше.
Живые пользователи, база, deployment, внешняя генерация и человеческое принятие не входят
в этот scope и не объявляются проверенными. Для них остаются обычные процедуры проекта.

## Adversarial Pass

Проверены ошибочные размеры партии, отсутствующие герои, ранний просмотр секретов,
перспектива другого NPC, попытка игрока запустить бой, запуск без группы в месте боя,
повтор запроса и недопустимое превращение будущих сцен в сыгранные события.
Редакторская проверка исправила пересекающиеся причины сюжетов, неизвестные NPC факты
в отрицательных формулировках и ночной режим каменного кита. Полная итоговая сверка
подтвердила отсутствие отставших текстов в пакетах и книгах.

## Known Limitations

Нет живого плейтеста, настоящего импортирования/активации в рабочем приложении или
провайдерской аттестации. Баланс и длительность — подготовленные рекомендации.
SVG — функциональные сетки, не созданные растровые иллюстрации. Сюжетное сравнение относится
к захваченным версиям 53 кампаний; последующие чужие правки могут потребовать новой сверки.
Полный `pnpm validate` с миграциями/сидированием не запускался. Чужие изменения сохранены.

## Required Output

Отчёт и локальные материалы переданы владельцу. Технический результат **PASS**;
дальнейшая публикация, живая активация и принятие владельцем не подразумеваются.
