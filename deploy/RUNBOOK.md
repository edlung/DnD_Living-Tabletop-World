# Living Tabletop World — runbook / регламент эксплуатации

Русский и английский рядом: каждая процедура сначала по-русски, затем по-английски; команды
общие. Решения: `docs/adr/0037-deployment.md`; файлы: `deploy/AGENTS.md`.

Russian and English side by side: each procedure in Russian, then in English; the commands are
shared. Decisions: `docs/adr/0037-deployment.md`; files: `deploy/AGENTS.md`.

Все команды выполняются из корня рабочей копии репозитория на сервере (ниже `/opt/ltw`), от
пользователя из группы `docker` (оператора); `dc` — это Compose развёртывания (никогда не
запускайте голый `docker compose` в корне: там `docker-compose.yml` разработки). Секреты живут
только в `deploy/.env`; никогда не печатайте его и не вставляйте значения в команды. Каждый
сервис получает из `deploy/.env` только то, что `compose.yaml` ему называет: сервер — свои
настройки (ключи ИИ, `PUBLIC_ORIGIN`, …), но не пароль базы отдельно, не настройки копий и не
адрес тревог. Журналы задач cron пишутся в `/var/log/ltw` (раздел 1, шаг 4).

Every command runs from the root of the repository checkout on the server (`/opt/ltw` below), as
a user in the `docker` group (the operator); `dc` is the deployment's Compose (never run a bare
`docker compose` in the root: the development `docker-compose.yml` lives there). Secrets live
only in `deploy/.env`; never print it and never put a value into a command line. Each service
receives from `deploy/.env` only what `compose.yaml` names for it: the server its own settings (AI
keys, `PUBLIC_ORIGIN`, …), not the database password on its own, the backup settings or the alarm
webhook. Cron jobs log to `/var/log/ltw` (section 1, step 4).

```bash
alias dc='docker compose -f /opt/ltw/deploy/compose.yaml'
```

| Что / What                                 | Где / Where                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Сервисы / services                         | `deploy/compose.yaml`: `proxy`, `server`, `postgres`, `backup`                             |
| Настройки и секреты / settings and secrets | `deploy/.env` (имена / names: `deploy/.env.example`)                                       |
| Образы / images                            | `ltw-server:<tag>`, `ltw-proxy:<tag>`; `<tag>` = 12 символов коммита / 12-character commit |
| Резервные копии / backups                  | `BACKUP_DIR` на хосте / on the host, `SHA256SUMS`                                          |
| Скрипты / scripts                          | `deploy/scripts/*.sh`                                                                      |

## 1. Первая установка на VPS · First install on a VPS

**RU.** Нужны: VPS (Ubuntu 24.04 LTS, 2 vCPU, 4 ГБ памяти, 40 ГБ SSD — сборка образа требует
около 2 ГБ), домен, доступ по SSH. Решение владельца Q10: развёртывание ждёт доступа к серверу и
домена; до этого стек проверяется локально (раздел 11).

**EN.** You need a VPS (Ubuntu 24.04 LTS, 2 vCPU, 4 GB of memory, 40 GB SSD; building the images
needs about 2 GB), a domain and SSH access. Owner decision Q10: deploying waits for the server and
the domain; until then the stack is verified locally (section 11).

1. **DNS.** RU: запись `A` для домена, например `play.example.org`, на адрес сервера (`AAAA` —
   только после включения IPv6 в сети `edge`, шаг 5); дождитесь, пока она разрешается. EN: an `A`
   record for the domain, e.g. `play.example.org`, pointing at the server (`AAAA` only once IPv6 is
   enabled on the `edge` network, step 5); wait until it resolves.
2. **Docker.** RU: Docker Engine 28 или новее (рекомендуется 29) и плагин Compose из репозитория
   Docker (`docker-ce`, `docker-compose-plugin`); пользователь развёртывания в группе `docker` (это
   права root — только для оператора). Внутренние сети `backend` и `data` используют режим шлюза
   `isolated` (с Engine 28): у хоста нет адреса в них. Старый Engine молча игнорирует этот режим и
   даёт хосту адрес внутри диапазона, которому сервер доверяет `X-Forwarded-For`. Поэтому
   `deploy.sh`, `restore.sh` и `ci.sh` отказываются работать с Engine старше 28, а `deploy.sh` и
   `restore.sh` после создания сетей проверяют `docker network inspect` (внутренняя сеть, режим
   `isolated`, без шлюза), прежде чем запустить сервер. Проверка вручную:
   `deploy/verify/preflight-check.sh`. EN: Docker Engine 28 or later (29 recommended) and the
   Compose plugin from Docker's repository (`docker-ce`, `docker-compose-plugin`); the deploying
   user in the `docker` group (root-equivalent: the operator only). The internal networks
   `backend` and `data` use the bridge gateway mode `isolated` (Engine 28+): the host has no
   address on them. An older Engine silently ignores the mode and gives the host an address inside
   the range whose `X-Forwarded-For` the server trusts. So `deploy.sh`, `restore.sh` and `ci.sh`
   refuse an Engine before 28, and `deploy.sh` and `restore.sh` check `docker network inspect`
   after creating the networks (internal, mode `isolated`, no gateway) before the server starts.
   By hand: `deploy/verify/preflight-check.sh`.

   ```bash
   docker version --format '{{.Server.Version}}'   # 28.x or later
   ```

3. **Брандмауэр / Firewall.** RU: снаружи открыты только 22 (лучше с ограничением по адресу), 80 и
   443/tcp. Docker публикует порты в обход `ufw`, поэтому никогда не публикуйте других портов:
   `compose.yaml` публикует только 80 и 443 прокси. EN: only 22 (preferably restricted by
   address), 80 and 443/tcp are open. Docker publishes ports past `ufw`, so never publish any other
   port: `compose.yaml` publishes only the proxy's 80 and 443.

   ```bash
   sudo ufw default deny incoming && sudo ufw allow 22/tcp && sudo ufw allow 80/tcp \
     && sudo ufw allow 443/tcp && sudo ufw enable
   ```

4. **Код и каталог копий / Code and the backup directory.** RU: репозиторий закрытый — клонируйте
   с ключом развёртывания только для чтения. EN: the repository is private: clone it with a
   read-only deploy key.

   ```bash
   sudo install -d -o "$USER" /opt/ltw
   git clone git@github.com:edlung/DnD_Living-Tabletop-World.git /opt/ltw
   cd /opt/ltw && git checkout <revision>
   sudo install -d -m 700 -o 70 -g 70 /var/backups/ltw   # uid 70 = postgres in the images
   sudo install -d -m 750 -o "$USER" -g "$USER" /var/log/ltw   # the cron jobs' logs (section 9)
   ```

   RU: каталог копий читает только uid 70 (и root): оператор видит копии через сервис `backup`
   (`dc exec -T backup ls -1 /backups`), копию вне сервера делает root (раздел 10). EN: only uid 70
   (and root) can read the backup directory: the operator lists dumps through the `backup` service
   (`dc exec -T backup ls -1 /backups`), and root makes the off-host copy (section 10).

5. **`deploy/.env`.** RU: скопируйте пример, задайте права 600 и заполните; пароль базы только из
   шестнадцатеричных символов. EN: copy the example, set mode 600 and fill it in; the database
   password must be hexadecimal.

   ```bash
   cp deploy/.env.example deploy/.env && chmod 600 deploy/.env
   openssl rand -hex 32   # paste as POSTGRES_PASSWORD in an editor, never on a command line
   ```

   `PUBLIC_HOST=play.example.org`, `PUBLIC_ORIGIN=https://play.example.org`, `TLS_MODE=acme`,
   `BACKUP_DIR=/var/backups/ltw`; ключи ИИ пустые, пока владелец не утвердил расходы / AI keys
   stay empty until the owner authorizes spending (ADR 0032).

   RU: `PUBLIC_ORIGIN` обязателен: вход по приглашениям строит из него ссылки, cookie и проверку
   `Origin`; ровно `https://<домен>` без косой черты (с `:<порт>`, если HTTPS не на 443).
   EN: `PUBLIC_ORIGIN` is required: invitation sign-in builds links, the cookie and the `Origin`
   check from it; exactly `https://<domain>` without a trailing slash (with `:<port>` when HTTPS is
   not on 443).

   **Граница доверия / Trust boundary.** RU: сервер подключён только к внутренней сети `backend`
   (общей лишь с Caddy; без адреса на хосте — режим `isolated`, нужен Docker Engine 28+), к
   внутренней `data` (база, копии) и к `egress` (только его исходящие вызовы ИИ) и слушает лишь
   свой адрес в `backend` (`<префикс>.10`). Адрес клиента он берёт из `X-Forwarded-For` только от
   соседа из диапазона `backend` (`LTW_TRUST_PROXY` = `<префикс>.0/24`, задаёт compose), а Caddy
   заменяет заголовок, присланный клиентом: ограничения по адресу видят настоящих клиентов, и никто,
   кроме Caddy, не подставит чужой адрес. `LTW_BACKEND_PREFIX` (по умолчанию `10.231.251`) меняйте,
   только если диапазон пересекается с сетью сервера; никогда не публикуйте порт `server`.
   Проверка: `deploy/verify/trust-boundary.sh` (раздел 11; безопасна и на сервере). IPv6: без
   IPv6 в сети `edge` Docker передаёт IPv6-клиентов через свой прокси от одного адреса шлюза, и все
   они делят одно ограничение — публикуйте только запись `A`, пока IPv6 в `edge` не включён.
   EN: the server joins only the internal `backend` network (shared with Caddy alone; no address
   on the host: gateway mode `isolated`, Docker Engine 28 or later), the internal `data` network
   (database, backups) and `egress` (its outbound AI calls only), and listens only at its backend
   address (`<prefix>.10`). It takes the client's address from `X-Forwarded-For` only from a peer
   in the backend range (`LTW_TRUST_PROXY` = `<prefix>.0/24`, set by compose), and Caddy replaces
   any such header a client sends: per-address limits see real clients, and nothing but Caddy can
   name another address. Change `LTW_BACKEND_PREFIX` (default `10.231.251`) only if the range
   collides with a network of the server; never publish the `server` port. Check:
   `deploy/verify/trust-boundary.sh` (section 11; safe on a server too). IPv6: without IPv6 on the
   `edge` network Docker relays IPv6 clients through its own proxy from one gateway address, and
   they all share one limit; publish only the `A` record until IPv6 is enabled on `edge`.

6. **Сборка и запуск / Build and start.** RU: сборка из закоммиченной ревизии печатает тег; запуск
   ждёт, пока все сервисы станут здоровыми; сертификат выпускается автоматически. EN: the build
   from a committed revision prints the tag; the start waits until every service is healthy; the
   certificate is issued automatically.

   ```bash
   tag=$(deploy/scripts/build.sh <revision>)
   deploy/scripts/deploy.sh "$tag"
   curl -fsS https://play.example.org/api/readyz      # {"status":"ready"}
   ```

   RU: сборка на другой машине: `deploy/scripts/build.sh <tag> --platform linux/amd64`, затем
   `docker save ltw-server:<t> ltw-proxy:<t> | ssh <vps> docker load`. EN: building elsewhere:
   the same with `--platform linux/amd64`, then `docker save … | ssh <vps> docker load`.

7. **Кампания проверки и вход / Review campaign and sign-in.** RU: кампания проверки (Gate 06) —
   русский Равенфорд («Пропавший караван», кампания `ravenford`), заведённый через World Engine;
   место, которое фикстура отдала персоне разработки (Эловен), DM освобождает командой
   `ReleaseCharacter`, так что игроков приглашает DM. Сид приносит и картины кураторов (ADR 0035):
   51 картину (45 файлов `fixtures/ravenford-ru/assets/`) DM запрашивает и одобряет для игроков, а
   делает их генератор `curated` из закоммиченных файлов — без вызова провайдера; работающий сервер
   эти запросы не трогает. Скрипт повторяем (кампания и картины не дублируются, занятые места не
   отбираются) и каждый раз печатает **новую** ссылку DM — один раз: это секрет, передайте её DM
   личным каналом и не сохраняйте в журналах, тикетах и чатах с историей. Повтор возможен, пока
   фикстуры сида те же: если база заведена более старой ревизией фикстур, сид отказывает
   («seeded by an older fixture revision») — тогда нужен сброс (раздел 12). Одна база — один
   Равенфорд: английский сид на ней отказывает (`COMMAND_ID_CONFLICT`). EN: the review campaign
   (Gate 06) is the Russian Ravenford ("Пропавший караван", campaign `ravenford`) created through
   the World Engine; the seat the fixture gave a development persona (Elowen) is released by the
   DM's `ReleaseCharacter`, so the DM invites the players. The seed brings the curated pictures
   too (ADR 0035): 51 pictures (45 files of `fixtures/ravenford-ru/assets/`) the DM requests and
   approves for players, made by the `curated` generator from the committed files, with no
   provider call; the running server leaves those requests alone. The script can be rerun (the
   campaign and its pictures are never duplicated, taken seats are never taken back) and prints a
   **new** DM link each time, once: it is a secret, hand it to the DM over a private channel and
   keep it out of logs, tickets and chats that keep history. A rerun works while the seed's fixtures
   are unchanged: on a database an older fixture revision seeded, the seed is refused ("seeded by
   an older fixture revision") and a reset is needed (section 12). One database holds one
   Ravenford: the English seed is refused on it (`COMMAND_ID_CONFLICT`).

   ```bash
   deploy/scripts/review-campaign.sh --expires-hours 72   # the seed, then the DM link (JSON line)
   ```

   RU: DM открывает ссылку и нажимает «Занять место»; в листе «Игроки» выбирает свободного
   персонажа и создаёт ссылку-приглашение (на 1, 3 или 7 дней, одноразовая; показывается один раз),
   игрок открывает её и тоже нажимает «Занять место». Там же DM видит игроков за столом и отзывает
   доступ («Отозвать доступ»): экран игрока сразу показывает «Вы вышли». Так это проверяет в
   браузере `deploy/verify/browser-journey.sh`, по HTTP — `deploy/verify/sign-in-journey.sh`
   (раздел 11). EN: the DM opens the link and presses "Take your seat"; in the Players sheet the DM
   chooses a free character and creates an invitation link (1, 3 or 7 days, single-use; shown
   once), and the player opens it and takes the seat too. There the DM sees the players at the
   table and revokes access ("Revoke access"): the player's screen shows "You are signed out" at
   once. `deploy/verify/browser-journey.sh` checks this in a browser, `deploy/verify/sign-in-journey.sh`
   over HTTP (section 11).

8. **Наблюдение / Monitoring.** RU: включите `watch.sh` (раздел 9) и еженедельную тренировку
   восстановления (раздел 5) и проведите первую тренировку сейчас: `watch.sh` тревожит, пока ни
   одна не прошла. EN: enable `watch.sh` (section 9) and the weekly restore drill (section 5),
   and run the first drill now: `watch.sh` alarms until one has passed.

   ```bash
   deploy/scripts/backup-now.sh && deploy/scripts/restore-drill.sh
   ```

## 2. Выкатить тег · Deploy a tag

**RU.** `deploy.sh` по порядку: проверяет Docker Engine (28+) и образы; отказывается от тега, в
котором нет работающей ревизии, без `--rollback` (это откат, раздел 3); если изменились сети
`compose.yaml` (их дайджест `LTW_NETWORKS_DIGEST`), удаляет контейнеры и сети (тома остаются):
Compose сам не умеет перевести на них работающий стек. Если база существует, он делает
**защищённую копию** до любых изменений (`ltw-predeploy-…`; при необходимости сам запускает
PostgreSQL и сервис `backup`) и записывает её имя в `deploy/.env` как `LTW_PREDEPLOY_DUMP` (при
откате — `LTW_ROLLBACK_DUMP`). Обычное хранение такие копии не удаляет: хранятся 5 новейших каждого
вида (`BACKUP_KEEP_PROTECTED`). Сервис `backup` пересоздаётся, если изменился каталог
`deploy/backup/` (метка `ltw.backup-script` = `LTW_BACKUP_SCRIPT_DIGEST`): его цикл всегда
выполняет скрипт этой рабочей копии. Затем текущий тег запоминается как предыдущий, контейнеры
создаются, сети `backend` и `data` проверяются на отсутствие адреса хоста, и только потом всё
запускается (миграции — при старте под advisory lock); `deploy.sh` ждёт здоровья всех сервисов.
**EN.** `deploy.sh`, in order: checks the Docker Engine (28+) and the images; refuses a tag that
does not contain the running revision unless `--rollback` is given (that is a rollback, section
3); when the networks of `compose.yaml` changed (their digest `LTW_NETWORKS_DIGEST`), removes the
containers and networks (volumes stay): Compose alone cannot move a running stack onto them. When
the database exists, it takes a **protected dump** before anything changes (`ltw-predeploy-…`;
starting PostgreSQL and the `backup` service itself when needed) and records its name in
`deploy/.env` as `LTW_PREDEPLOY_DUMP` (`LTW_ROLLBACK_DUMP` for a rollback). The regular retention
never removes such dumps: the newest 5 of each kind are kept (`BACKUP_KEEP_PROTECTED`). The
`backup` service is recreated whenever `deploy/backup/` changed (label `ltw.backup-script` =
`LTW_BACKUP_SCRIPT_DIGEST`), so its loop always runs this checkout's script. Then the current tag
is recorded as the previous one, the containers are created, the `backend` and `data` networks are
checked for a host address, and only then does everything start (migrations at start under an
advisory lock); `deploy.sh` waits until every service is healthy.

```bash
cd /opt/ltw && git fetch && git checkout <revision>
tag=$(deploy/scripts/build.sh <revision>)
deploy/scripts/deploy.sh "$tag"
deploy/scripts/logs.sh --since 10m --errors     # empty is good / пусто — хорошо
```

RU: перед тегом, который добавляет миграцию, прочитайте его заметки: миграции только добавляют, но
откат через такую миграцию возможен лишь по разделу 3. EN: before a tag that adds a migration,
read its notes: migrations only add, but rolling back across one is possible only as section 3
describes.

## 3. Откатить · Roll back

**RU.** Откат запускает предыдущие образы на той же базе. Миграции только добавляют, поэтому
прежний образ может работать на базе, которую мигрировал новый, — но только с явным флагом
`--rollback` (иначе откажут мигратор и `deploy.sh`: тег без работающей ревизии — это откат). С
`--rollback` (`LTW_ALLOW_NEWER_SCHEMA=true`) готовность прежнего образа разбирает **каждое**
сохранённое событие, прежде чем ответить «готов»: новый образ мог ослабить схему события без новой
версии (ADR 0007 это разрешает) и записать то, что строгие схемы прежнего отвергают где угодно в
потоке. На большой истории это занимает время; сервер до тех пор не готов. Если прежний образ не
стал готовым (`deploy.sh` падает, дождавшись нездорового `server`; в журнале `not ready` с
`eventStore` и `this build cannot read event <кампания>#<номер>`), восстановите защищённую копию,
которую `deploy.sh` сделал перед выкаткой, от которой вы откатываетесь (`LTW_PREDEPLOY_DUMP`; игра
после неё теряется, состояние, которое вы покидаете, хранит `LTW_ROLLBACK_DUMP`), или исправьте и
выкатите вперёд.

**EN.** A rollback runs the previous images on the same database. Migrations only add, so the
earlier image can run on a database the newer one migrated, but only with the explicit
`--rollback` (otherwise the migrator and `deploy.sh` refuse: a tag without the running revision is
a rollback). With `--rollback` (`LTW_ALLOW_NEWER_SCHEMA=true`) the earlier image's readiness
parses **every** stored event before it reports ready: the newer image may have loosened an
event's payload schema without a new version (ADR 0007 allows it) and written what the earlier
image's strict schemas refuse anywhere in a stream. On a long history that takes a while; the
server is not ready meanwhile. If the earlier image does not become ready (`deploy.sh` fails after
waiting for an unhealthy `server`; the log shows `not ready` with `eventStore` and
`this build cannot read event <campaign>#<sequence>`), restore the protected dump `deploy.sh` took
before the deploy you are rolling back (`LTW_PREDEPLOY_DUMP`; play since then is lost, and
`LTW_ROLLBACK_DUMP` keeps the state you leave), or fix and roll forward.

**RU — мастерская кампаний (этапы400/420).** После появления расходов AI с областью
мастерской или выбранных визуальных манифестов откат к сборкам до0018/0019/0020
на той же базе не поддерживается, даже с `--rollback`. Прежняя готовность проверяет
события игры, но не новые области расходов и атомарное наследование изображений.
Для восстановления сохраняйте сборку, понимающую эти миграции; для более старой
сборки нужна согласованная защищённая копия и сверка внешних расходов провайдера.
Уже совершённые платные вызовы не отменяются восстановлением базы.

**EN — campaign workshop (Stages400/420).** Once workshop AI accounting or chosen
visual manifests exist, application/operator builds predating0018/0019/0020 are
unsupported on that database, including with `--rollback`. Earlier readiness checks
game events, not the new spending subjects or atomic image inheritance. Retain a
migration-aware recovery build; an older build requires a matching consistent
protected backup and external provider-cost reconciliation. Restoring a database
does not reverse already dispatched paid calls.

**RU — защищённые правки (этап430).** После миграции0021 используйте понимающую
её сборку приложения и оператора. Более старый писатель пропускает защиту, а
старый worker может обработать EDIT как полную генерацию. Проверка событий игры
не устанавливает совместимость этих таблиц. Для отката к старой сборке нужна
согласованная защищённая копия до использования новых правок.

**EN — protected edits (Stage430).** After migration0021, retain an aware app and
operator build. Older writers bypass protections; older workers may consume EDIT
as full generation. Game-event readiness does not establish compatibility of
these tables. An older build requires a consistent protected backup from before
the new controls were used.

**RU — активация кампаний (этап440).** Для записей0022 нужна сборка приложения,
оператора и replay-инструментов, понимающая активацию. Старые сборки не закрывают
неопубликованные потоки и не завершают подтверждённое действие; проверка событий этого не
исправляет. После событий `PreparedPartyEstablished`, `AssetAdopted` или
`CampaignBootstrapped` нужны и совместимые схемы событий. `--rollback` /
`LTW_ALLOW_NEWER_SCHEMA` не разрешают такой откат. Сохраняйте совместимую сборку
для восстановления; для более старой нужна согласованная защищённая копия до новых активаций.

При перезапуске worker продолжает тот же подтверждённый источник и стабильные ID,
даже если прежняя сессия завершилась. До проверки команды, provenance, immutable
контента и точных байтов кампания остаётся PROVISIONING и закрыта для игры,
приглашений, изображений и SSE. Не меняйте SQL status/phase/source и не удаляйте
запись для повторного старта. Исправьте причину отказа и используйте совместимую
сборку/разрешённый владельцу retry для повторяемого сбоя. Ошибки proof не обходятся
ручной публикацией или снятием запрета retry.
Активация не генерирует изображения и не вызывает платного провайдера.

**EN — campaign activation (Stage440).** Records from0022 require an aware app,
operator and replay build. Older builds do not gate unpublished streams or resume
accepted intent; event readiness cannot repair that. Once
`PreparedPartyEstablished`, `AssetAdopted` or `CampaignBootstrapped` is stored,
compatible event schemas are also required. `--rollback` / `LTW_ALLOW_NEWER_SCHEMA`
does not authorize this downgrade. Keep an aware recovery build; an older build
requires a consistent protected backup from before the new activations.

On restart, the worker resumes the same confirmed source and stable IDs even after
the original session ends. The campaign remains PROVISIONING, closed to play,
invitations, pictures and SSE until command/provenance, immutable content and exact
bytes are verified. Never change SQL status/phase/source or delete the row to
restart. Repair the cause and use the aware build/authorized owner retry for a
retryable failure. Never bypass failed proof by publishing manually or changing
the retryability flag. Activation generates no pictures and
makes no paid provider call.

```bash
previous=$(sed -n 's/^LTW_PREVIOUS_IMAGE_TAG=//p' deploy/.env)
git checkout "$previous"          # the deploy files of that revision
deploy/scripts/deploy.sh --rollback "$previous"
# not ready? / не готов?
deploy/scripts/logs.sh --since 15m server | grep '"not ready"'
deploy/scripts/restore.sh "$(sed -n 's/^LTW_PREDEPLOY_DUMP=//p' deploy/.env)"   # section 5
# forward again later / позже снова вперёд:
git checkout <newer> && deploy/scripts/deploy.sh <newer-tag>
```

RU: ревизии до 2026-10-16 (b1618cb и раньше) не знают защищённых копий, `restore.sh` и проверки
всех событий: откат на них — только по их собственному регламенту. EN: revisions before
2026-10-16 (b1618cb and earlier) have no protected dumps, `restore.sh` or readiness over every
event: roll back to them only by their own runbook.

RU: если `compose.yaml` той ревизии описывает другие сети (например, до части B Stage 350), её
`deploy.sh` этого не замечает: сначала `dc down` (никогда не `-v`: тома и база остаются), затем
`deploy.sh --rollback`. Вперёд `deploy.sh` справляется сам (`LTW_NETWORKS_DIGEST`). EN: when that
revision's `compose.yaml` describes other networks (e.g. before Stage 350 part B), its `deploy.sh`
does not notice: run `dc down` first (never `-v`: volumes and the database stay), then
`deploy.sh --rollback`. Forward, `deploy.sh` handles it (`LTW_NETWORKS_DIGEST`).

## 4. Сменить ключи · Rotate keys

- **Ключи ИИ и изображений / AI and image keys.** RU: создайте новый ключ у провайдера, замените в
  `deploy/.env` (`ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`), пересоздайте сервер, затем отзовите
  старый ключ у провайдера. EN: create a new key at the provider, replace it in `deploy/.env`,
  recreate the server, then revoke the old key at the provider.

  ```bash
  dc up -d --force-recreate --wait server
  ```

- **Пароль базы / Database password.** RU: задайте новый пароль интерактивно (он не попадает в
  командную строку), впишите его в `deploy/.env`, пересоздайте сервисы, которые подключаются.
  EN: set the new password interactively (it never reaches a command line), put it into
  `deploy/.env`, recreate the services that connect.

  ```bash
  dc exec postgres psql -U ltw -d ltw -c '\password ltw'
  dc up -d --force-recreate --wait server backup
  ```

- **TLS.** RU: сертификаты Let's Encrypt продлевает Caddy; `watch.sh` предупреждает за 14 дней.
  EN: Caddy renews the Let's Encrypt certificates; `watch.sh` warns 14 days ahead.
- **Сессии / Sessions (Stage 340).** RU: ключа подписи нет — сессии и приглашения случайные и
  хранятся только хешами, менять нечего; выйти везде за человека — раздел 6 (`revoke-actor`,
  `revoke-dm`). EN: there is no signing key (sessions and invitations are random and stored only
  as hashes), so nothing to rotate; to sign someone out everywhere see section 6 (`revoke-actor`,
  `revoke-dm`).

## 5. Восстановить из копии · Restore from backup

**RU.** Копии: каждые 6 часов и по запросу, хранится всё младше суток, новейшая за каждый из 14
дней и за каждую из 8 недель. Защищённые копии — перед каждой выкаткой и откатом
(`ltw-predeploy-…`, раздел 2) и перед восстановлением (`ltw-prerestore-…`) — обычное хранение не
трогает: хранятся 5 новейших каждого вида (`BACKUP_KEEP_PROTECTED`). `SHA256SUMS` перечисляет все.
Журнал событий — канон: восстановление проверяется повторным проигрыванием каждой кампании.
Список копий: `dc exec -T backup ls -1 /backups`.

**EN.** Backups: every 6 hours and on demand; everything younger than a day, the newest of each of
14 days and of each of 8 weeks are kept. Protected dumps, taken before every deploy and rollback
(`ltw-predeploy-…`, section 2) and before a restore (`ltw-prerestore-…`), are outside that
retention: the newest 5 of each kind are kept (`BACKUP_KEEP_PROTECTED`). `SHA256SUMS` lists them
all. The event store is canonical: a restore is proven by replaying every campaign. List the
dumps: `dc exec -T backup ls -1 /backups`.

**RU/EN — Stage440.** Сохраняйте activation-записи, immutable initial content,
команды/события, исходные draft-байты и campaign-байты вместе в одной копии базы.
Raw readiness/replay включает неопубликованные потоки; обычный gated engine для
тренировки непригоден. Replay не доказывает целостность private manifests/байтов:
совместимый recovery worker проверяет их до публикации. Preserve activation rows,
immutable initial content, commands/events and both draft/campaign image bytes in
the same database backup. Raw readiness/replay includes unpublished streams; the
ordinary gated engine cannot prove a full restore. Replay does not prove private
manifest/byte integrity: the aware recovery worker verifies them before publication.

**Тренировка (еженедельно и после выкатки) / Drill (weekly and after every deploy).** RU: новейшая
обычная копия (или названная) восстанавливается во временную базу, каждая кампания проигрывается
через World Engine и сравнивается с живой базой на той же версии. Тренировка проходит, только если
всё совпало, копия не пуста (копия пустой или наполовину восстановленной базы проваливается; флаг
`--allow-empty` — только если база тогда законно была пустой) и в ней есть каждая живая кампания,
созданная до времени копии (из её имени). Итог каждой тренировки дописывается в
`deploy/restore-drill.log`; `watch.sh` тревожит, если последняя провалилась, старше 8 дней или её
нет. EN: the newest regular dump (or the one named) is restored into a throwaway database, every
campaign is replayed through the World Engine and compared with the live database at the same
version. The drill passes only when everything matches, the restore is not empty (a dump of an
empty or half-restored database fails; `--allow-empty` only when the database legitimately was
empty then), and it holds every live campaign created before the dump's time (from its name).
Each drill appends its verdict to `deploy/restore-drill.log`; `watch.sh` alarms when the last one
failed, is older than 8 days, or there is none.

```bash
deploy/scripts/backup-now.sh          # optional: a fresh dump first / сначала свежая копия
deploy/scripts/restore-drill.sh       # or / или: restore-drill.sh ltw-20261016T120000Z.dump
# cron (the operator's crontab): 0 4 * * 1  cd /opt/ltw && deploy/scripts/restore-drill.sh >>/var/log/ltw/drill.log 2>&1
```

**Настоящее восстановление / A real restore** (игра после копии теряется / play after the dump
is lost). RU: `restore.sh` проверяет копию, сохраняет текущее состояние защищённой копией
(`ltw-prerestore-…`, имя печатается), **останавливает сервис `backup`** вместе с прокси и сервером
(ни одна копия пустой или наполовину восстановленной базы не пишется и не становится новейшей),
пересоздаёт базу, восстанавливает копию одной транзакцией одноразовым контейнером сервиса
`backup`, запускает всё (миграции поднимают старую копию; первая копия цикла — уже
восстановленного мира) и проводит тренировку. Если восстановление не удалось, база может быть
пустой, а `backup`, прокси и сервер остаются остановленными: верните прежнее состояние той же
командой с напечатанной копией `ltw-prerestore-…`. EN: `restore.sh` checks the dump, keeps the
current state as a protected dump (`ltw-prerestore-…`, its name printed), **stops the `backup`
service** with the proxy and the server (no dump of an empty or half-restored database is written
or becomes the newest), recreates the database, restores the dump in one transaction from a
one-off container of the `backup` service, starts everything (migrations bring an older dump
forward; the loop's first dump is of the restored world) and runs the drill. If the restore
fails, the database may be empty and `backup`, the proxy and the server stay stopped: go back with
the same command and the printed `ltw-prerestore-…` dump.

```bash
deploy/scripts/restore.sh <dump>       # e.g. the LTW_PREDEPLOY_DUMP of deploy/.env (section 3)
```

RU: на новом сервере: шаги 1–5 раздела 1; скопируйте копии и `SHA256SUMS` в `BACKUP_DIR` от root
с владельцем 70 (`sudo install -o 70 -g 70 -m 600 <файлы> /var/backups/ltw/`); соберите образы
(шаг 6, без `deploy.sh`), впишите тег в `LTW_IMAGE_TAG` и выполните `restore.sh <копия>`: он
запускает только PostgreSQL, так что копии пустой базы не появляется. EN: on a new server: steps
1–5 of section 1; copy the dumps and `SHA256SUMS` into `BACKUP_DIR` as root with owner 70
(`sudo install -o 70 -g 70 -m 600 <files> /var/backups/ltw/`); build the images (step 6 without
`deploy.sh`), set `LTW_IMAGE_TAG` and run `restore.sh <dump>`: it starts PostgreSQL alone, so no
dump of the empty database appears.

## 6. Отозвать пользователя · Revoke a user (Stage 340)

**RU.** DM отзывает игрока в клиенте (список участников) — это
`POST /api/campaigns/<id>/members/<characterId>/revoke`: все сессии и открытые приглашения
персонажа отзываются, персонаж освобождается (`ReleaseCharacter`); действует со следующего
запроса и следующего цикла живого потока. Срочно закрыть доступ всем: `dc stop proxy` (сайт
недоступен, данные целы); вернуть: `dc up -d --wait proxy`.

**EN.** The DM revokes a player in the client (the members list), which is
`POST /api/campaigns/<id>/members/<characterId>/revoke`: every session and open invitation of that
character is revoked and the character released (`ReleaseCharacter`); effective on the next request
and the live stream's next cycle. To close access for everyone at once: `dc stop proxy` (the site is
down, data intact); back with `dc up -d --wait proxy`.

**Оператор / Operator (Stage 340).** RU: список живых сессий кампании (без токенов и хешей);
выход DM из кампании (его сессии и неиспользованные ссылки DM; новый вход — новой ссылкой,
раздел 1 шаг 7); выход одного актёра везде. Отзыв называет источник разрешения (кто и где
попросил); он выводится в единственной строке JSON — сохраните её как запись оператора. Локальный
пример: `reports/evidence/stage-350/part-b/`. EN: a campaign's live sessions (no token or hash);
signing the DM out of a campaign (its sessions and unused DM links; back in with a new link,
section 1 step 7); signing one actor out everywhere. A revocation names its authorization source
(who asked, where); it is echoed in the one JSON output line: keep that line as the operator's
record. A local example: `reports/evidence/stage-350/part-b/`.

```bash
dc exec -T server node apps/server/dist/auth/operator-cli.js sessions --campaign ravenford
dc exec -T server node apps/server/dist/auth/operator-cli.js revoke-dm --campaign ravenford \
  --authorization-source '<who asked, where>'
dc exec -T server node apps/server/dist/auth/operator-cli.js revoke-actor --actor '<actorId>' \
  --authorization-source '<who asked, where>'
```

**Логины / Logins (Stage 600, ADR 0041).** RU: у игроков и мастеров есть логины (без почты);
логин создаётся только вместе с местом по приглашению. Забытый пароль: мастер кампании выдаёт
ссылку сброса на листе «Игроки» (кнопка у игрока), а свой собственный — оператор командой ниже.
Ссылка `<PUBLIC_ORIGIN>/reset#…` срабатывает один раз, живёт 72 часа, показывается один раз —
передайте её лично, как ссылку-приглашение; новый пароль выводит логин из всех устройств и
кампаний. Выйти за человека везде — `revoke-actor` выше. EN: players and DMs have logins (no
e-mail); a login is made only together with a seat from an invitation. A forgotten password: a
campaign's DM issues a reset link from the Players sheet (a button by the player), the operator
issues one with the command below (the DM's own, say). The link `<PUBLIC_ORIGIN>/reset#…` works
once, for 72 hours, and is shown once — hand it over privately, like an invitation; the new
password signs the login out of every device and campaign. Signing a person out everywhere is
`revoke-actor` above.

```bash
dc exec -T server node apps/server/dist/auth/operator-cli.js reset-password --login '<login>'
```

**Экраны стола / Table screens (Stage 610, ADR 0042).** RU: настраивать нечего. Телевизор
открывает `<PUBLIC_ORIGIN>/display` и показывает код; мастер вводит его в «Экране стола» и там же
отключает один экран или все. Экран только читает (взгляд отряда), ничего не пишет; его cookie
`ltw_display` живёт 30 дней. Ссылка стола (`/table#…`, лист «Игроки») живёт в памяти сервера:
после перезапуска мастер открывает новую. Миграция 0028 только добавляет таблицы: откат на
прежнюю сборку их не трогает. Отключить все экраны кампании без мастера — запрос ниже. EN:
nothing to configure. A TV opens `<PUBLIC_ORIGIN>/display` and shows a code; the DM types it on
Table screen and unpairs one screen or all there. A screen only reads (the party's view) and
writes nothing; its `ltw_display` cookie lasts 30 days. The table link (`/table#…`, the Players
sheet) lives in the server's memory: after a restart the DM opens a new one. Migration 0028 only
adds tables: a rollback to the previous build leaves them alone. Unpairing every screen of a
campaign without its DM is the statement below.

```bash
dc exec -T postgres psql -U ltw -d ltw -c \
  "UPDATE ltw_displays SET revoked_at = now() WHERE campaign_id = '<campaign>' AND revoked_at IS NULL"
```

**Экран мастера / The DM's screen (Stage 620, ADR 0043).** RU: настраивать нечего. Миграция 0029
только добавляет таблицы заметок и состояния стола и колонку группы у запросов проверки; откат на
прежнюю сборку их не трогает (прежняя сборка не удерживает ходы игроков на паузе). Если игра
осталась на паузе без мастера — запрос ниже снимает паузу. EN: nothing to configure. Migration 0029
only adds the notes and table-state tables and a group column on check requests; a rollback to the
previous build leaves them alone (that build does not hold players' commands while paused). To lift
a pause the DM left on, run the statement below.

```bash
dc exec -T postgres psql -U ltw -d ltw -c \
  "UPDATE ltw_table_states SET paused = false, updated_at = now() WHERE campaign_id = '<campaign>'"
```

## 7. Остановить все расходы на ИИ · Stop all AI spending

**RU.** Сразу: очистите в `deploy/.env` `ANTHROPIC_API_KEY`, `LTW_AI_ROUTES`, `LTW_AI_APPROVAL_ID`
и пересоздайте сервер — все возможности становятся локальными. Записью оператора (переживает
перезапуски): отключите каждый счёт (`spend.sh` их перечисляет); отключённый счёт ничего не
допускает (ADR 0032).

**EN.** Immediately: empty `ANTHROPIC_API_KEY`, `LTW_AI_ROUTES`, `LTW_AI_APPROVAL_ID` in
`deploy/.env` and recreate the server: every capability becomes local. As an operator record
(survives restarts): disable every billing account (`spend.sh` lists them); a disabled account
admits nothing (ADR 0032).

```bash
dc up -d --force-recreate --wait server
dc exec -T server node apps/server/dist/ai/accounting/operator-cli.js account-revise \
  --account <id> --disable --owner <owner> --authorized-on <YYYY-MM-DD> \
  --authorization-source <reference>
deploy/scripts/spend.sh               # status and spend (below): AI and images
```

**Отчёт о расходах / The spend report** (`deploy/scripts/spend.sh`; read-only, operator only;
integer microdollars as strings). RU: две строки JSON. `status` — счётчики: открытые удержания,
действующие остановки, незавершённые запросы, отключённые счета и одобрения, и `images`. `spend` —
по каждому счёту ИИ траты за сегодня (UTC-день базы) и всего, открытые удержания, потолок и
переключатель; по каждому одобрению траты против потолка этапа; и `images` — журнал картин:
`ceilingMicros` (null — численного потолка нет; при `monetaryPolicy.mode = UNLIMITED` расходы
разрешены без денежного лимита, иначе без сохранённого потолка вызовы запрещены), `spentMicros` (списанное как списано, открытые
резервы целиком), `heldMicros` (открытые резервы), `remainingMicros` (что потолок ещё допускает,
не меньше нуля), `charges`, `unsettled` и `unsettledReservations` — каждый открытый резерв с
кампанией, моделью, суммой и возрастом (`ageMinutes`; старше `settleableAfterMinutes` — брошенный,
раздел 8). EN: two JSON lines. `status` holds the counts: open holds, active stops, incomplete
requests, disabled accounts and approvals, and `images`. `spend` gives each AI billing account's
spend today (the database's UTC day) and in total, its open holds, ceiling and switch; each
approval's spend against its stage ceiling; and `images`, the picture ledger: `ceilingMicros`
(null: no numeric ceiling; `monetaryPolicy.mode = UNLIMITED` explicitly permits uncapped
monetary spending, otherwise a missing stored ceiling refuses calls), `spentMicros` (settled charges as settled, open reservations whole),
`heldMicros` (open reservations), `remainingMicros` (what the ceiling still admits, never below
zero), `charges`, `unsettled` and `unsettledReservations`, each open reservation with its campaign,
model, amount and age (`ageMinutes`; older than `settleableAfterMinutes` is orphaned, section 8).

## 7b. Мастерская кампаний: пригласить, отозвать, остановить расходы · Campaign workshop: invite, revoke, stop spending (Gate 07, G07-10)

**RU.** Мастерская (создание кампаний ИИ) доступна только владельцу с приглашением. Оператор
выдаёт и отзывает приглашения командой `workshop:operator`; отзыв владельца **не** закрывает
сессии DM в уже активированных им кампаниях и не отзывает ранее выданные ссылки DM — для этого
`revoke-dm` по каждой кампании (раздел 6; это решение владельца проекта, G07-05). При
`monetaryPolicy.mode = UNLIMITED` единственные остановки расходов — эти команды: у текста и у
картин свои переключатели. Каждая команда выводит одну строку JSON — сохраните её как запись
оператора (кто и где разрешил: `--authorization-source`).

**EN.** The workshop (AI campaign creation) is for an invited owner only. The operator issues and
revokes invitations with `workshop:operator`; revoking an owner does **not** close the DM sessions
in campaigns they already activated, nor withdraw DM links issued earlier — use `revoke-dm` per
campaign for that (section 6; the project owner's decision, G07-05). Under
`monetaryPolicy.mode = UNLIMITED` these commands are the only spending stops: text and pictures
have their own switches. Each command prints one JSON line: keep it as the operator's record
(who allowed it and where: `--authorization-source`).

```bash
# Пригласить владельца (ссылка печатается один раз) · Invite an owner (the link is printed once)
dc exec -T server node apps/server/dist/workshop/operator-cli.js invite \
  --owner <uuid> --expires-hours 24 --authorization-source '<who asked, where>'
# Отозвать владельца · Revoke an owner
dc exec -T server node apps/server/dist/workshop/operator-cli.js revoke \
  --owner <uuid> --authorization-source '<who asked, where>'
# Платная подготовка текста: включить/выключить грант владельца · Paid text preparation: grant on/off
dc exec -T server node apps/server/dist/ai/accounting/operator-cli.js preparation-grant \
  --approval <id> --workshop-owner <uuid> --disable \
  --owner <owner> --authorized-on <YYYY-MM-DD> --authorization-source <reference>
# Платные картины: грант владельца · Paid pictures: the owner's grant
dc exec -T server node apps/server/dist/ai/accounting/operator-cli.js picture-grant \
  --workshop-owner <uuid> --disable \
  --owner <owner> --authorized-on <YYYY-MM-DD> --authorization-source <reference>
# Аварийная остановка денежной политики: FINITE · Emergency stop: monetary policy to FINITE
dc exec -T server node apps/server/dist/ai/accounting/operator-cli.js monetary-policy-set \
  --scope text --account <id> --mode finite \
  --owner <owner> --authorized-on <YYYY-MM-DD> --authorization-source <reference>
dc exec -T server node apps/server/dist/ai/accounting/operator-cli.js monetary-policy-set \
  --scope images --mode finite \
  --owner <owner> --authorized-on <YYYY-MM-DD> --authorization-source <reference>
deploy/scripts/spend.sh               # проверить: траты и удержания · check: spend and holds
```

## 7a. Включить живой ИИ · Enable live AI

**RU.** Без этого раздела все возможности локальные: NPC отвечают заготовками, намерения DM разбирает
офлайн-интерпретатор. Живой ИИ включается только записями оператора в пределах решения владельца
(потолки — записи в базе, не настройки; ADR 0032). Порядок: (1) счёт с дневным потолком;
(2) одобрение на кампанию с потолками этапа, дня кампании, игровой сессии и прогона оценки;
(3) в `deploy/.env` — маршруты, одобрение и ключ (права 600; ключ никогда не в чате, журнале или
команде); (4) пересоздать сервер; (5) `spend.sh` — счёт и одобрение включены, 0 открытых удержаний.
Маршрут каждой возможности заканчивается на `local`: отказ провайдера или исчерпанный потолок
возвращают локальный ответ, а не ошибку. Проверено Gate 06 (команда ai, 2026-10-27): 35 живых
вызовов Sonnet 5.5 на русской кампании — $0.088; удержание резервирует худший случай (~$2.54) и
освобождается после расчёта. Остановить — раздел 7.

**EN.** Without this section every capability is local: NPCs answer from templates and the offline
interpreter reads DM intents. Live AI is enabled only through operator records within the owner's
decision (ceilings are database records, never settings; ADR 0032). In order: (1) a billing account
with its daily ceiling; (2) an approval for the campaign with stage, campaign-day, play-session and
evaluation-run ceilings; (3) in `deploy/.env` the routes, the approval and the key (mode 600; the key
never in a chat, log or command line); (4) recreate the server; (5) `spend.sh`: the account and
approval enabled, 0 open holds. Every capability's route ends in `local`: a provider failure or a
spent ceiling answers locally, not with an error. Verified by Gate 06 (team ai, 2026-10-27): 35 live
Sonnet 5.5 calls on the Russian campaign, $0.088; a hold reserves the worst case (~$2.54) and is
released when the call settles. To stop: section 7.

```bash
# (1)-(2): integer microdollars ($10 = 10000000); --authorization-source names the owner's decision.
dc exec -T server node apps/server/dist/ai/accounting/operator-cli.js account-create \
  --account anthropic-owner --provider-account-ref '<console account, not the key>' \
  --global-daily-ceiling-micros 15000000 \
  --owner <owner> --authorized-on <YYYY-MM-DD> --authorization-source <reference>
dc exec -T server node apps/server/dist/ai/accounting/operator-cli.js approval-create \
  --approval playtest-sonnet --account anthropic-owner --stage stage-360 \
  --grant-reference <reference> --campaign ravenford \
  --stage-ceiling-micros 30000000 --campaign-daily-ceiling-micros 15000000 \
  --play-session-ceiling-micros 10000000 --evaluation-run-ceiling-micros 10000000 \
  --owner <owner> --authorized-on <YYYY-MM-DD> --authorization-source <reference>
# (3) deploy/.env (the key is pasted into the file by an editor, never echoed):
#   ANTHROPIC_API_KEY=…
#   LTW_AI_ROUTES=reasoning=anthropic:claude-sonnet-5-5,local;npc-dialogue=anthropic:claude-sonnet-5-5,local;narrative=anthropic:claude-sonnet-5-5,local
#   LTW_AI_APPROVAL_ID=playtest-sonnet
# (4)-(5)
dc up -d --force-recreate --wait server
deploy/scripts/spend.sh
```

## 8. Изображения в игре: включить, ограничить, остановить · Images in play: enable, cap, stop

**RU.** По умолчанию сервер работает с генератором `placeholder` (`LTW_IMAGE_GENERATOR` пуст или
`placeholder`): картины кампании проверки приходят из набора кураторов (раздел 1, шаг 7), а
запросы DM в игре дают нейтральные заготовки — провайдер не вызывается и ничего не тратится.
Картины, которые DM заказывает в игре, рисует модель OpenAI через OpenRouter (решение владельца
Q6), только в пределах потолка, который записывает оператор с разрешением владельца; ни одна
настройка его не поднимает. Каждый вызов сначала резервирует худший случай модели ($0,50 для
`openai/gpt-5.4-image-2`, $0,20 для `openai/gpt-5-image-mini`), затем списывает стоимость, которую
сообщил провайдер (или весь резерв, если она неизвестна); без записанного потолка или с потолком 0
вызовов нет. Игрок видит картину только после одобрения DM.

**EN.** By default the server runs the `placeholder` generator (`LTW_IMAGE_GENERATOR` empty or
`placeholder`): the review campaign's pictures come from the curated set (section 1, step 7), and
the DM's requests in play make neutral placeholders: no provider is called and nothing is spent.
Pictures the DM asks for in play are painted by an OpenAI model through OpenRouter (owner decision
Q6), only within the ceiling the operator records with the owner's authorization; no setting can
raise it. Each call first reserves its model's worst case ($0.50 for `openai/gpt-5.4-image-2`,
$0.20 for `openai/gpt-5-image-mini`), then settles to the cost the provider reported (or the whole
reservation when it is unknown); with no ceiling recorded, or a ceiling of 0, no call is made.
Players see a picture only once the DM approved it.

**Включить / Enable** (RU: сначала потолок, затем ключ и генератор в `deploy/.env` редактором,
никогда не в командной строке; EN: the ceiling first, then the key and the generator in
`deploy/.env` with an editor, never on a command line):

```bash
dc exec -T server node apps/server/dist/ai/accounting/operator-cli.js image-budget-set \
  --micros 5000000 --owner <owner> --authorized-on <YYYY-MM-DD> --authorization-source <reference>
# deploy/.env: LTW_IMAGE_GENERATOR=openrouter-openai, OPENROUTER_API_KEY=<key>,
#              LTW_IMAGE_MODEL= (empty: openai/gpt-5.4-image-2; or openai/gpt-5-image-mini)
dc up -d --force-recreate --wait server
dc logs --no-log-prefix server | grep '"msg":"image generator"'   # "generator":"openrouter-openai"
deploy/scripts/spend.sh                                            # images: the ceiling, nothing spent yet
```

RU: если в журнале старта есть `no image ceiling stored`, потолка нет и каждый вызов отклоняется.
EN: `no image ceiling stored` in the start log means no ceiling: every call is refused.

**Остановить / Stop.** RU: сразу — `LTW_IMAGE_GENERATOR=placeholder` (или пусто) и пустой
`OPENROUTER_API_KEY` в `deploy/.env`, затем `dc up -d --force-recreate --wait server` (только
пустой ключ при `openrouter-openai` сервер не запустит: конфигурация требует ключ). Записью
оператора, которая переживает перезапуски и замену ключа: потолок 0 — вызовов нет, задания
падают с `UNAVAILABLE`, показывается нейтральная замена. EN: at once: `LTW_IMAGE_GENERATOR=placeholder`
(or empty) and an empty `OPENROUTER_API_KEY` in `deploy/.env`, then `dc up -d --force-recreate --wait
server` (an empty key alone with `openrouter-openai` stops the server from starting: the
configuration requires the key). As an operator record that survives restarts and a new key: a
ceiling of 0 — no call, jobs fail as `UNAVAILABLE`, the neutral fallback shows.

```bash
dc exec -T server node apps/server/dist/ai/accounting/operator-cli.js image-budget-set \
  --micros 0 --owner <owner> --authorized-on <YYYY-MM-DD> --authorization-source <reference>
```

**Брошенные резервы / Orphaned reservations.** RU: задание, остановленное между резервом и
списанием (сбой, убитый процесс), оставляет резерв открытым — он считается потраченным целиком.
`spend.sh` перечисляет все открытые резервы с возрастом; старше `settleableAfterMinutes` (15 минут)
оператор закрывает их с разрешением владельца: целиком или суммой из записей провайдера. EN: a job
stopped between its reservation and its settlement (a crash, a killed process) leaves the
reservation open, counted as spent in full. `spend.sh` lists every open reservation with its age;
once older than `settleableAfterMinutes` (15 minutes) the operator closes it with the owner's
authorization: whole, or at the amount the provider's records show.

```bash
dc exec -T server node apps/server/dist/ai/accounting/operator-cli.js image-reservations --older-than-minutes 15
dc exec -T server node apps/server/dist/ai/accounting/operator-cli.js image-reservation-settle \
  --charge <chargeId> [--charge-micros <amount>] --owner <owner> --authorized-on <YYYY-MM-DD> \
  --authorization-source <reference>
```

RU: картины лежат в базе (`ltw_asset_contents`, до 2 МБ каждая) и входят в каждую копию: набор
кураторов добавляет около 15 МБ. EN: pictures live in the database (`ltw_asset_contents`, up to
2 MB each) and are in every dump: the curated set adds about 15 MB.

**Иллюстрации мастерской: грант владельца · Workshop pictures: the owner's grant (Gate 07).**
RU: политика UNLIMITED для изображений сама никому не разрешает платные иллюстрации в мастерской:
нужен грант конкретного владельца, как `preparation-grant` для текста. Он проверяется, когда
мастерская предлагает иллюстрации, когда задание ставится в очередь и когда резервируются деньги;
выключение действует на следующий же резерв. При обновлении (миграция 0024) грант получили
владельцы, у которых был включён грант на текст. Приглашение нового владельца иллюстраций не
даёт. Задания ограничены: на черновик одна активная генерация или правка, на владельца две, и не
больше четырёх иллюстраций в работе; лишний запрос получает 429 и ничего не записывает, а
очередь обслуживает владельцев по очереди. EN: the UNLIMITED image policy alone admits no owner
to paid workshop pictures: each owner needs their own grant, as `preparation-grant` is for text.
It is checked when the workshop offers pictures, when a job is queued and when its charge is
reserved; disabling it stops the very next reservation. At the upgrade (migration 0024) owners
whose text grant was enabled received it; inviting a new owner grants no pictures. Jobs are
bounded: one active generation or edit per draft, two per owner, at most four pictures in
progress; a request over the bound gets 429 and records nothing, and the queue serves owners in
turn.

```bash
dc exec -T server node apps/server/dist/ai/accounting/operator-cli.js picture-grant \
  --workshop-owner <ownerId> --enable|--disable --owner <owner> --authorized-on <YYYY-MM-DD> \
  --authorization-source <reference>
```

RU: после миграций 0023/0024 откат требует сборки, которая их знает (раздел 3): старая сборка не
проверяет грант и не может прочитать ревизии черновиков, сохранённые с идентификаторами квестов.
EN: after migrations 0023/0024 a rollback needs a build that knows them (section 3): an older
build checks no grant and cannot read draft revisions saved with quest identities.

## 9. Журналы и тревоги · Logs and alarms

**RU.** Журналы — JSON в stdout каждого контейнера, Docker хранит 5 × 100 МБ на сервис.
`watch.sh` проверяет диск (> 80 %), память (> 85 %), здоровье каждого сервиса (копия старше 7 часов
делает `backup` нездоровым), строки ошибок и ответы 5xx за 15 минут (> 20), готовность через прокси,
срок сертификата (< 14 дней) и тренировку восстановления (последняя провалилась, старше 8 дней или
её нет; `deploy/restore-drill.log`); каждая тревога — строка в `deploy/alarms.log` и, если задан
`ALARM_WEBHOOK_URL`, JSON `{"text": …}` на этот адрес (формат Slack). Адрес — секрет: `curl`
получает его на стандартный ввод (`--config -`), а не в аргументах, которые видит любой
пользователь хоста (`ps`). Задачи cron — в crontab оператора (`crontab -e`), их журналы — в
`/var/log/ltw` (раздел 1, шаг 4) с ротацией ниже.

**EN.** Logs are JSON on each container's stdout; Docker keeps 5 × 100 MB per service. `watch.sh`
checks disk (> 80 %), memory (> 85 %), every service's health (a dump older than 7 hours makes
`backup` unhealthy), error lines and 5xx answers in 15 minutes (> 20), readiness through the
proxy, certificate expiry (< 14 days) and the restore drill (the last one failed, is older than 8
days, or there is none; `deploy/restore-drill.log`); each alarm is a line in `deploy/alarms.log`
and, with `ALARM_WEBHOOK_URL` set, JSON `{"text": …}` posted there (Slack format). The URL is a
secret: `curl` reads it on standard input (`--config -`), never from its arguments, which any user
on the host can list (`ps`). Cron jobs go in the operator's crontab (`crontab -e`) and log to
`/var/log/ltw` (section 1, step 4), rotated as below.

```bash
deploy/scripts/logs.sh --since 1h --errors        # errors only / только ошибки
deploy/scripts/logs.sh --since 30m server         # one service / один сервис
deploy/scripts/watch.sh                           # exit 1 when an alarm was raised
# cron (the operator's crontab): */5 * * * *  cd /opt/ltw && deploy/scripts/watch.sh >>/var/log/ltw/watch.log 2>&1
dc ps                                             # health of every service
```

```bash
# /etc/logrotate.d/ltw (as root) / ротация журналов cron:
printf '%s\n' '/var/log/ltw/*.log {' '  weekly' '  rotate 8' '  compress' '  missingok' \
  '  notifempty' '  copytruncate' '}' | sudo tee /etc/logrotate.d/ltw >/dev/null
```

## 10. Копия вне сервера · Off-host backup copy

**RU.** Ожидает решения владельца о месте хранения (Q10). Копии содержат все секреты кампаний:
вне сервера храните их только зашифрованными (например, `restic` или `rclone crypt`) и без
удаления старых. Каталог копий (700, владелец uid 70) читает только root, поэтому копирование —
задача **root** (`sudo crontab -e`; настройка `rclone` в `/root/.config/rclone/rclone.conf`, права
600), а не оператора. Пример ежедневной задачи после выбора места: **EN.** Pending the owner's
choice of location (Q10). The dumps hold every campaign secret: off the server, keep them only
encrypted (e.g. `restic` or `rclone crypt`) and never delete older copies in sync. Only root can
read the backup directory (mode 700, owner uid 70), so the copy is a **root** job (`sudo crontab
-e`; the `rclone` configuration in `/root/.config/rclone/rclone.conf`, mode 600), not the
operator's. A daily job once the target exists:

```bash
# root's crontab: 30 5 * * *  rclone copy /var/backups/ltw ltw-offsite:backups --include 'ltw-*.dump' --include SHA256SUMS >>/var/log/ltw/offsite.log 2>&1
```

## 11. Локальная проверка · Local verification

**RU.** Так Stage 350 проверен на машине разработчика (доказательства:
`reports/evidence/stage-350/`, часть B — `part-b/`, полный продукт — `full-product/`): `deploy/.env` с `PUBLIC_HOST=localhost`,
`PUBLIC_ORIGIN=https://localhost`, `TLS_MODE=internal`, портами на `127.0.0.1`; стек ровно такой,
как в эксплуатации (вход по приглашениям, один `compose.yaml`). Нужны `curl`, `jq`, `python3`,
`openssl`. Скрипты `deploy/verify/`:

- `smoke.sh` — TLS, заголовки, клиент, готовность, опубликованные порты, пользователи и корневые ФС;
- `proxy-contract.sh <tag>` — что прокси пересылает (заглушка вместо сервера);
- `images.sh` — картины через прокси: генератор `placeholder`, потолка нет, ничего не потрачено
  (`spend.sh`); все 51 картина набора одобрены для игроков; игрок получает каждую, которую видит
  Эловен (200, `image/webp`, `nosniff`, `no-store`, политика `sandbox`, байты по хешу), и 404 на
  остальные; неодобренная картина (заготовка DM) — 404, как несуществующий хеш; без ключей в журналах;
- `browser-journey.sh` — тот же путь в браузере (Playwright, Chromium через Caddy, по-русски):
  ссылка DM от оператора, «Занять место», лист «Игроки», игрок видит площадь с картиной и фигурами,
  действует, DM отзывает — «Вы вышли» по живому потоку; ни одного нарушения политики, токена вне
  погашения или в журналах. Локальному CA Caddy доверяет только этот запуск (ключ его
  промежуточного сертификата), ничего не ставится в хранилища доверия. Нужны `pnpm install` и
  `pnpm exec playwright install chromium`;
- `sign-in-journey.sh` — вход по-русски по HTTP двумя «браузерами» (cookie): ссылка DM от
  оператора, приглашение игрока, игра, отзыв (поток игрока закрывается сразу), использованные и
  поддельные ссылки, 409, межсайтовые запросы, выход; ни одного токена в журналах;
- `live-stream.sh` — живой поток через прокси без буферизации (сессия DM по приглашению);
- `trust-boundary.sh` — сети, адрес и сокет сервера, недоступность API с хоста и из `edge`,
  подделанный `X-Forwarded-For` не меняет клиента;
- `preflight-check.sh` — `deploy.sh` и `ci.sh` отказывают на Engine 27 (заглушка `docker`), сеть с
  адресом хоста отвергается (временные сети);
- `watch-check.sh` — тревоги тренировки восстановления и адрес вебхука только на стандартном вводе
  `curl` (временный приёмник; запускать там, где вебхук не задан);
- `retention-check.sh` (с защищёнными копиями); `ci.sh` делает всё это на чистой копии (так же
  работает CI), включая тренировку на пустой первой копии и вторую выкатку; без браузера —
  `LTW_CI_BROWSER=skip` (он об этом скажет).

Ограничения: каждый из входов тратит запросы погашения этого хоста (10 в минуту, блокировка на
15 минут после 20 отказов в час): `images.sh` — 2, `browser-journey.sh` — 2, `sign-in-journey.sh` —
7, `live-stream.sh` — 1, `trust-boundary.sh` — до 11 (запускайте последним); повтор — через минуту, после 20 отказов в час —
перезапуск сервера (`dc restart server`; ограничения в памяти). **Docker Desktop** (macOS, Windows)
доставляет все подключения к опубликованным портам от адреса шлюза сети `edge`: локально все
браузеры — один клиент для ограничений по адресу. На Linux-сервере внешние клиенты сохраняют свои
адреса (кроме запросов с самого хоста и IPv6 без IPv6 в `edge`, раздел 1 шаг 5).

**EN.** How Stage 350 was verified on a development machine (evidence:
`reports/evidence/stage-350/`, part B in `part-b/`, the full product in `full-product/`): `deploy/.env` with `PUBLIC_HOST=localhost`,
`PUBLIC_ORIGIN=https://localhost`, `TLS_MODE=internal` and ports on `127.0.0.1`; the stack exactly
as production runs it (invitation sign-in, `compose.yaml` alone). Needs `curl`, `jq`, `python3`,
`openssl`. Scripts in `deploy/verify/`:

- `smoke.sh`: TLS, headers, client, readiness, published ports, users and root filesystems;
- `proxy-contract.sh <tag>`: what the proxy forwards (a stand-in for the server);
- `images.sh`: the pictures through the proxy: the `placeholder` generator, no ceiling, nothing
  spent (`spend.sh`); all 51 curated pictures approved for players; the player gets every one
  Elowen sees (200, `image/webp`, `nosniff`, `no-store`, the `sandbox` policy, bytes matching the
  hash) and a 404 for the rest; an unapproved picture (the DM's placeholder) is a 404 like a hash
  nobody stored; no credential in the logs;
- `browser-journey.sh`: the same path in a browser (Playwright, Chromium through Caddy, in
  Russian): the operator's DM link, "Take your seat", the Players sheet, the player sees the market
  square with its picture and figures and acts, the DM revokes: "You are signed out" through the
  live stream; no policy violation, no token outside the redeem or in the logs. Caddy's local CA is
  trusted by this run alone (the key of its intermediate); nothing enters a trust store. Needs
  `pnpm install` and `pnpm exec playwright install chromium`;
- `sign-in-journey.sh`: the Russian sign-in over HTTP with two "browsers" (cookie jars): the
  operator's DM link, a player invitation, play, revocation (the player's stream closes at once),
  used and forged links, 409, cross-site requests, sign-out; no token in any log;
- `live-stream.sh`: the live stream through the proxy, unbuffered (a DM session by invitation);
- `trust-boundary.sh`: the networks, the server's address and socket, the API unreachable from
  the host and from `edge`, a forged `X-Forwarded-For` never changes the client;
- `preflight-check.sh`: `deploy.sh` and `ci.sh` refuse Engine 27 (a stub `docker`), a network
  with a host address is refused (throwaway networks);
- `watch-check.sh`: the restore drill alarms, and the webhook URL only on `curl`'s standard input
  (a throwaway receiver; run it where no webhook is configured);
- `retention-check.sh` (with protected dumps); `ci.sh` runs all of it on a clean checkout (as CI
  does), including a drill on the empty first dump and a second deploy; without a browser,
  `LTW_CI_BROWSER=skip` (it says so).

Limits: each sign-in spends this host's redeem attempts (10 a minute, a 15-minute lockout after
20 refusals in an hour): `images.sh` 2, `browser-journey.sh` 2, `sign-in-journey.sh` 7,
`live-stream.sh` 1, `trust-boundary.sh` up to 11 (run it last); rerun after a minute, and after 20 refusals in an hour restart the server
(`dc restart server`; the limits live in memory). **Docker Desktop** (macOS, Windows) delivers every
connection to a published port from the `edge` network's gateway address: locally all browsers
are one client to the per-address limits. On a Linux server outside clients keep their addresses
(except requests from the host itself, and IPv6 without IPv6 on `edge`, section 1 step 5).

## 12. Сбросить базу кампании проверки · Reset a review campaign database

**RU.** Только для базы проверки или пробной игры: всё в ней пропадает — игра, сеансы и
приглашения, записи расходов ИИ и изображений, сохранённые потолки. Нужен, когда сид отказывает
сообщением «this database was seeded by an older fixture revision … Reset required»: ID команд
сида позиционные (`ravenford.seed.0001`, …), и после изменения фикстур (Gate 06 дал секретным
существам непрозрачные ID) те же ID в базе хранят другие команды — повтор этого не исправит.
Порядок: защищённая копия (вид `prerestore`: обычное хранение её не удаляет; имя печатается —
сохраните его), остановка `backup`, прокси и сервера,
новая пустая база, запуск всего (миграции создают таблицы), сид и новая ссылка DM, затем копия и
тренировка уже нового мира. Потолки ИИ и изображений (разделы 7–8) задайте заново, игроков
пригласите заново. Вернуться к прежнему миру: `deploy/scripts/restore.sh <копия из шага 1>`.

**EN.** For a review or playtest database only: everything in it is lost — play, sessions and
invitations, AI and image spending records, stored ceilings. Needed when the seed is refused with
"this database was seeded by an older fixture revision … Reset required": seed command IDs are
positional (`ravenford.seed.0001`, …), so after the fixtures change (Gate 06 gave secret entities
opaque IDs) the same IDs in the database hold other commands, and no rerun can fix that. In
order: a protected dump (kind `prerestore`: the regular retention never removes it; its name is
printed — keep it), stop `backup`, the proxy and the server, a
new empty database, start everything (migrations create the tables), the seed and a new DM link,
then a dump and a drill of the new world. Set the AI and image ceilings again (sections 7–8) and
invite the players again. Back to the previous world: `deploy/scripts/restore.sh <the dump of
step 1>`.

```bash
dump=$(dc exec -T backup /bin/sh /opt/ltw/backup.sh pre-restore)   # 1. protected / защищённая
dc exec -T backup /bin/sh /opt/ltw/backup.sh verify "$dump" && echo "$dump"   # keep the name
dc stop backup proxy server                       # 2.
dc exec -T postgres psql --username ltw --dbname postgres --quiet --set ON_ERROR_STOP=1 \
  --command 'DROP DATABASE ltw WITH (FORCE)' --command 'CREATE DATABASE ltw OWNER ltw'  # 3.
dc up --detach --wait --wait-timeout 300          # 4. migrations run as the server starts
deploy/scripts/review-campaign.sh --expires-hours 72   # 5. the seed, then the DM link (secret)
deploy/scripts/backup-now.sh && deploy/scripts/restore-drill.sh   # 6.
```

## 14. Ретранслятор голоса · The voice relay

**RU.** Голос стола (ADR 0060) идёт напрямую между экранами; там, где они не видят друг друга
(разные домашние роутеры, мобильная сеть), его несёт ретранслятор TURN (coturn) — звук и через него
зашифрован между экранами. **Порты ретранслятора на общем VPS открывает только владелец**; до его
согласия раздел не выполняется, и голос работает только напрямую. Порядок, когда согласие есть:

1. Сгенерировать секрет (`openssl rand -base64 32`) и записать в `deploy/.env`:
   `LTW_TURN_SECRET=<секрет>`, `LTW_TURN_URLS=turn:<PUBLIC_HOST>:3478,turns:<PUBLIC_HOST>:5349`.
   Значение не печатать и не передавать в командной строке.
2. Запустить coturn рядом (отдельный контейнер, образ закрепить по дайджесту при первом
   скачивании) с настройками: `use-auth-secret`, `static-auth-secret=<тот же секрет>`,
   `realm=<PUBLIC_HOST>`, `listening-port=3478`, `tls-listening-port=5349` с сертификатом прокси,
   `min-port=49160`, `max-port=49200`, `external-ip=<публичный адрес>`, `no-cli`,
   `no-multicast-peers`, и **запрет частных адресов**: `denied-peer-ip` для 10.0.0.0/8,
   172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16 и `::1`, `fc00::/7`, `fe80::/10` —
   иначе ретранслятор стал бы дорогой во внутренние сети VPS.
3. Открыть на брандмауэре VPS: UDP и TCP 3478, TCP 5349, UDP 49160–49200.
4. `deploy/scripts/deploy.sh` (сервер перечитает настройки), затем проверить: два браузера в
   разных сетях входят в голос, в панели «Голос» нет строки «Без ретранслятора…».
   Выключить: убрать обе настройки из `deploy/.env`, перезапустить сервер, остановить coturn, закрыть
   порты.

**EN.** The table's voice (ADR 0060) flows directly between screens; where they cannot reach each
other (two home routers, a mobile network), a TURN relay (coturn) carries it, still encrypted between
the screens. **Only the owner opens the relay's ports on the shared VPS**; until then this section
is not carried out and voice works only directly. With the owner's word: (1) generate a secret
(`openssl rand -base64 32`) into `deploy/.env` as `LTW_TURN_SECRET`, with
`LTW_TURN_URLS=turn:<PUBLIC_HOST>:3478,turns:<PUBLIC_HOST>:5349`, never printed or passed on a
command line; (2) run coturn beside the stack (its image pinned by digest on first pull) with
`use-auth-secret`, the same `static-auth-secret`, `realm=<PUBLIC_HOST>`, ports 3478 and 5349 (the
proxy's certificate), relay ports 49160–49200, `external-ip`, `no-cli`, `no-multicast-peers`, and
`denied-peer-ip` for every private, loopback and link-local range (so the relay never reaches the
VPS's internal networks); (3) open UDP and TCP 3478, TCP 5349 and UDP 49160–49200; (4) run
`deploy/scripts/deploy.sh` and check two browsers on different networks hear each other, the Voice
panel no longer saying "Without a relay…". To switch it off: remove both settings, restart the
server, stop coturn, close the ports.
