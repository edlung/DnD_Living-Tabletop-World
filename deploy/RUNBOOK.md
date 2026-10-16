# Living Tabletop World — runbook / регламент эксплуатации

Русский и английский рядом: каждая процедура сначала по-русски, затем по-английски; команды
общие. Решения: `docs/adr/0037-deployment.md`; файлы: `deploy/AGENTS.md`.

Russian and English side by side: each procedure in Russian, then in English; the commands are
shared. Decisions: `docs/adr/0037-deployment.md`; files: `deploy/AGENTS.md`.

Все команды выполняются из корня рабочей копии репозитория на сервере (ниже `/opt/ltw`), от
пользователя из группы `docker`; `dc` — это Compose развёртывания (никогда не запускайте голый
`docker compose` в корне: там `docker-compose.yml` разработки). Секреты живут только в
`deploy/.env`; никогда не печатайте его и не вставляйте значения в команды.

Every command runs from the root of the repository checkout on the server (`/opt/ltw` below), as
a user in the `docker` group; `dc` is the deployment's Compose (never run a bare `docker compose`
in the root: the development `docker-compose.yml` lives there). Secrets live only in
`deploy/.env`; never print it and never put a value into a command line.

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
2. **Docker.** RU: Docker Engine 29 и плагин Compose из репозитория Docker
   (`docker-ce`, `docker-compose-plugin`); пользователь развёртывания в группе `docker` (это права
   root — только для оператора). EN: Docker Engine 29 and the Compose plugin from Docker's
   repository (`docker-ce`, `docker-compose-plugin`); the deploying user in the `docker` group
   (root-equivalent: the operator only).
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
   ```

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
   `ReleaseCharacter`, так что игроков приглашает DM. Скрипт повторяем (кампания не дублируется,
   занятые места не отбираются) и каждый раз печатает **новую** ссылку DM — один раз: это секрет,
   передайте её DM личным каналом и не сохраняйте в журналах, тикетах и чатах с историей.
   Изображения кураторов придут со Stage 330. Одна база — один Равенфорд: английский сид на ней
   отказывает (`COMMAND_ID_CONFLICT`). EN: the review campaign (Gate 06) is the Russian Ravenford
   ("Пропавший караван", campaign `ravenford`) created through the World Engine; the seat the
   fixture gave a development persona (Elowen) is released by the DM's `ReleaseCharacter`, so the
   DM invites the players. The script can be rerun (the campaign is never duplicated, taken seats
   are never taken back) and prints a **new** DM link each time, once: it is a secret, hand it to
   the DM over a private channel and keep it out of logs, tickets and chats that keep history.
   Curated images arrive with Stage 330. One database holds one Ravenford: the English seed is
   refused on it (`COMMAND_ID_CONFLICT`).

   ```bash
   deploy/scripts/review-campaign.sh --expires-hours 72   # the seed, then the DM link (JSON line)
   ```

   RU: DM открывает ссылку, затем приглашает игроков: ссылка игрока на свободного персонажа (по
   умолчанию 72 ч, до 7 суток), одноразовая. Экраны браузера для приглашений (вход по ссылке, лист
   «Игроки») придут со Stage 340 часть B; до тех пор те же шаги по HTTP показывает
   `deploy/verify/sign-in-journey.sh`. EN: the DM opens the link, then invites the players: a
   single-use player link for a free character (72 h by default, 7 days at most). The browser
   screens for invitations (the join page, the Players sheet) arrive with Stage 340 part B; until
   then `deploy/verify/sign-in-journey.sh` shows the same steps over HTTP.

8. **Наблюдение / Monitoring.** RU: включите `watch.sh` (раздел 9) и еженедельную тренировку
   восстановления (раздел 5). EN: enable `watch.sh` (section 9) and the weekly restore drill
   (section 5).

## 2. Выкатить тег · Deploy a tag

**RU.** `deploy.sh` делает резервную копию, запоминает текущий тег как предыдущий, запускает
образы нового тега (миграции идут при старте под advisory lock) и ждёт здоровья всех сервисов.
Если изменились сети `compose.yaml` (их дайджест `LTW_NETWORKS_DIGEST`), он сначала останавливает
и удаляет контейнеры и сети (тома остаются): Compose сам не умеет перевести на них работающий стек.
**EN.** `deploy.sh` takes a backup, records the current tag as the previous one, starts the new
tag's images (migrations run at start under an advisory lock) and waits until every service is
healthy. When the networks of `compose.yaml` changed (their digest `LTW_NETWORKS_DIGEST`), it
first removes the containers and networks (volumes stay): Compose alone cannot move a running
stack onto them.

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
`--rollback` (иначе мигратор откажет). Если новый образ записал события, которых прежний не умеет
читать, прежний не станет готовым (`/api/readyz` → `eventStore`): тогда восстановите копию, которую
`deploy.sh` сделал перед выкаткой (раздел 5, игра после неё теряется), или исправьте и выкатите
вперёд.

**EN.** A rollback runs the previous images on the same database. Migrations only add, so the
earlier image can run on a database the newer one migrated, but only with the explicit
`--rollback` (otherwise the migrator refuses). If the newer image wrote events the earlier one
cannot read, the earlier one never becomes ready (`/api/readyz` → `eventStore`): then restore the
backup `deploy.sh` took before the deploy (section 5; play since then is lost), or fix and roll
forward.

```bash
previous=$(sed -n 's/^LTW_PREVIOUS_IMAGE_TAG=//p' deploy/.env)
git checkout "$previous"          # the deploy files of that revision
deploy/scripts/deploy.sh --rollback "$previous"
# forward again later / позже снова вперёд:
git checkout <newer> && deploy/scripts/deploy.sh <newer-tag>
```

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
дней и за каждую из 8 недель; `SHA256SUMS` перечисляет их. Журнал событий — канон: восстановление
проверяется повторным проигрыванием каждой кампании.

**EN.** Backups: every 6 hours and on demand; everything younger than a day, the newest of each of
14 days and of each of 8 weeks are kept; `SHA256SUMS` lists them. The event store is canonical: a
restore is proven by replaying every campaign.

**Тренировка (еженедельно и после выкатки) / Drill (weekly and after every deploy).** RU: новейшая
копия восстанавливается во временную базу, каждая кампания проигрывается через World Engine и
сравнивается с живой базой на той же версии; код выхода 0 только при полном совпадении. EN: the
newest dump is restored into a throwaway database, every campaign is replayed through the World
Engine and compared with the live database at the same version; exit status 0 only when all match.

```bash
deploy/scripts/backup-now.sh          # optional: a fresh dump first / сначала свежая копия
deploy/scripts/restore-drill.sh       # or / или: restore-drill.sh ltw-20261016T120000Z.dump
# cron: 0 4 * * 1  cd /opt/ltw && deploy/scripts/restore-drill.sh >>/var/log/ltw-drill.log 2>&1
```

**Настоящее восстановление / A real restore** (игра после копии теряется / play after the dump
is lost):

```bash
deploy/scripts/backup-now.sh                            # keep the current state too
dc exec -T backup /bin/sh /opt/ltw/backup.sh verify <dump>
dc stop proxy server
dc exec -T postgres psql -U ltw -d postgres \
  -c 'DROP DATABASE ltw WITH (FORCE)' -c 'CREATE DATABASE ltw OWNER ltw'
dc exec -T backup pg_restore --exit-on-error --single-transaction --no-owner \
  --no-privileges --dbname ltw /backups/<dump>
dc up -d --wait                                         # migrations bring an older dump forward
deploy/scripts/restore-drill.sh <dump>                  # the restored world equals the dump
```

RU: на новом сервере: шаги 1–5 раздела 1, затем скопируйте копии в `BACKUP_DIR`, соберите образы
(шаг 6, без `deploy.sh`), впишите тег в `LTW_IMAGE_TAG`, запустите `dc up -d --wait postgres backup`
и выполните восстановление выше. EN: on a new server: steps 1–5 of section 1, copy the dumps into
`BACKUP_DIR`, build the images (step 6 without `deploy.sh`), set `LTW_IMAGE_TAG`, start
`dc up -d --wait postgres backup` and restore as above.

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
deploy/scripts/spend.sh               # disabledAccounts, openHolds, today's spend
```

## 8. Остановить расходы на изображения · Stop image spending

**RU.** Сразу: очистите `OPENROUTER_API_KEY` в `deploy/.env` и пересоздайте сервер (задания
изображений падают с `UNAVAILABLE`, показывается нейтральная замена). Записью оператора (Stage
330, после слияния): `operator-cli.js image-budget-set --micros 0 …` с источником разрешения
владельца. **EN.** Immediately: empty `OPENROUTER_API_KEY` and recreate the server (image jobs fail
as `UNAVAILABLE`, the neutral fallback shows). As an operator record (Stage 330, once merged):
`operator-cli.js image-budget-set --micros 0 …` with the owner's authorization source.

## 9. Журналы и тревоги · Logs and alarms

**RU.** Журналы — JSON в stdout каждого контейнера, Docker хранит 5 × 100 МБ на сервис.
`watch.sh` проверяет диск (> 80 %), память (> 85 %), здоровье каждого сервиса (копия старше 7 часов
делает `backup` нездоровым), строки ошибок и ответы 5xx за 15 минут (> 20), готовность через прокси
и срок сертификата (< 14 дней); каждая тревога — строка в `deploy/alarms.log` и, если задан
`ALARM_WEBHOOK_URL`, JSON `{"text": …}` на этот адрес (формат Slack).

**EN.** Logs are JSON on each container's stdout; Docker keeps 5 × 100 MB per service. `watch.sh`
checks disk (> 80 %), memory (> 85 %), every service's health (a dump older than 7 hours makes
`backup` unhealthy), error lines and 5xx answers in 15 minutes (> 20), readiness through the proxy
and certificate expiry (< 14 days); each alarm is a line in `deploy/alarms.log` and, with
`ALARM_WEBHOOK_URL` set, JSON `{"text": …}` posted there (Slack format).

```bash
deploy/scripts/logs.sh --since 1h --errors        # errors only / только ошибки
deploy/scripts/logs.sh --since 30m server         # one service / один сервис
deploy/scripts/watch.sh                           # exit 1 when an alarm was raised
# cron: */5 * * * *  cd /opt/ltw && deploy/scripts/watch.sh >>/var/log/ltw-watch.log 2>&1
dc ps                                             # health of every service
```

## 10. Копия вне сервера · Off-host backup copy

**RU.** Ожидает решения владельца о месте хранения (Q10). Копии содержат все секреты кампаний:
вне сервера храните их только зашифрованными (например, `restic` или `rclone crypt`) и без
удаления старых. Пример ежедневной задачи после выбора места: **EN.** Pending the owner's choice of
location (Q10). The dumps hold every campaign secret: off the server, keep them only encrypted
(e.g. `restic` or `rclone crypt`) and never delete older copies in sync. A daily job once the
target exists:

```bash
# 30 5 * * *  rclone copy /var/backups/ltw ltw-offsite:backups --include 'ltw-*.dump' --include SHA256SUMS
```

## 11. Локальная проверка · Local verification

**RU.** Так Stage 350 проверен на машине разработчика (доказательства:
`reports/evidence/stage-350/`, часть B — `part-b/`): `deploy/.env` с `PUBLIC_HOST=localhost`,
`PUBLIC_ORIGIN=https://localhost`, `TLS_MODE=internal`, портами на `127.0.0.1`; стек ровно такой,
как в эксплуатации (вход по приглашениям, один `compose.yaml`). Нужны `curl`, `jq`, `python3`,
`openssl`. Скрипты `deploy/verify/`:

- `smoke.sh` — TLS, заголовки, клиент, готовность, опубликованные порты, пользователи и корневые ФС;
- `proxy-contract.sh <tag>` — что прокси пересылает (заглушка вместо сервера);
- `sign-in-journey.sh` — вход по-русски по HTTP двумя «браузерами» (cookie): ссылка DM от
  оператора, приглашение игрока, игра, отзыв (поток игрока закрывается сразу), использованные и
  поддельные ссылки, 409, межсайтовые запросы, выход; ни одного токена в журналах;
- `live-stream.sh` — живой поток через прокси без буферизации (сессия DM по приглашению);
- `trust-boundary.sh` — сети, адрес и сокет сервера, недоступность API с хоста и из `edge`,
  подделанный `X-Forwarded-For` не меняет клиента;
- `retention-check.sh`; `ci.sh` делает всё это на чистой копии (так же работает CI).

Ограничения: каждый из входов тратит запросы погашения этого хоста (10 в минуту, блокировка на
15 минут после 20 отказов в час): `sign-in-journey.sh` — 7, `live-stream.sh` — 1,
`trust-boundary.sh` — до 11 (запускайте последним); повтор — через минуту, после 20 отказов в час —
перезапуск сервера (`dc restart server`; ограничения в памяти). **Docker Desktop** (macOS, Windows)
доставляет все подключения к опубликованным портам от адреса шлюза сети `edge`: локально все
браузеры — один клиент для ограничений по адресу. На Linux-сервере внешние клиенты сохраняют свои
адреса (кроме запросов с самого хоста и IPv6 без IPv6 в `edge`, раздел 1 шаг 5).

**EN.** How Stage 350 was verified on a development machine (evidence:
`reports/evidence/stage-350/`, part B in `part-b/`): `deploy/.env` with `PUBLIC_HOST=localhost`,
`PUBLIC_ORIGIN=https://localhost`, `TLS_MODE=internal` and ports on `127.0.0.1`; the stack exactly
as production runs it (invitation sign-in, `compose.yaml` alone). Needs `curl`, `jq`, `python3`,
`openssl`. Scripts in `deploy/verify/`:

- `smoke.sh`: TLS, headers, client, readiness, published ports, users and root filesystems;
- `proxy-contract.sh <tag>`: what the proxy forwards (a stand-in for the server);
- `sign-in-journey.sh`: the Russian sign-in over HTTP with two "browsers" (cookie jars): the
  operator's DM link, a player invitation, play, revocation (the player's stream closes at once),
  used and forged links, 409, cross-site requests, sign-out; no token in any log;
- `live-stream.sh`: the live stream through the proxy, unbuffered (a DM session by invitation);
- `trust-boundary.sh`: the networks, the server's address and socket, the API unreachable from
  the host and from `edge`, a forged `X-Forwarded-For` never changes the client;
- `retention-check.sh`; `ci.sh` runs all of it on a clean checkout (as CI does).

Limits: each sign-in spends this host's redeem attempts (10 a minute, a 15-minute lockout after
20 refusals in an hour): `sign-in-journey.sh` 7, `live-stream.sh` 1, `trust-boundary.sh` up to 11
(run it last); rerun after a minute, and after 20 refusals in an hour restart the server
(`dc restart server`; the limits live in memory). **Docker Desktop** (macOS, Windows) delivers every
connection to a published port from the `edge` network's gateway address: locally all browsers
are one client to the per-address limits. On a Linux server outside clients keep their addresses
(except requests from the host itself, and IPv6 without IPv6 on `edge`, section 1 step 5).
