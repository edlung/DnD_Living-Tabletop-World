# 0061. Local mode: the server on the DM's laptop

- Status: Accepted (owner-delegated product decision 2026-11-04; `docs/FULL_GAME_PLAN.md` Stage 697 and
  decision 1, owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`). Starting the server on the
  home network and moving a campaign off the VPS stay the owner's acts: nothing here does either on
  its own. Builds on ADR 0037 (the deployment), 0041 (accounts), 0042 (the table display), 0058 §5
  (campaigns from the ready adventures).
- Context: the table plays over the internet (decision 1: "offline" is one room on the VPS). With no
  internet, or no wish to depend on it, the family wants the same game on the DM's laptop, the phones
  and the TV on the home Wi-Fi, and the same campaign back online afterwards with everything that
  happened at home. Phones refuse a site whose certificate they do not trust, and the sign-in cookie
  and the microphone need HTTPS.

## Decision

1. **The same stack on the laptop.** Local mode runs the deployment's own Compose project (the same
   images, migrations, sign-in by accounts and backups; `deploy/compose.yaml`) on the laptop with
   Docker, as its own project `ltw-local` with its own settings (`deploy/local/.env`, git-ignored, mode
   600, written on the first start with random secrets). One command, `deploy/local/ltw-local.sh
start`, builds the images of the checkout's commit the first time (the one step that needs the
   internet), finds the laptop's address on the home network, starts the stack, waits until it is
   ready and shows the address to join with its QR code. A new address (the router gave another)
   restarts what reads it. No AI key reaches the local server: AI stays off, pictures are the ready
   ones and the local placeholder.
2. **The home network only.** The proxy publishes its ports on the laptop's home-network address alone
   and answers only clients from private address ranges (where the platform keeps clients' addresses:
   Docker Desktop shows every client as its own gateway, so there the address binding is the limit).
   The start command reads the firewall's state (macOS's application firewall, `ufw` or `firewalld`
   on Linux) and says what to allow; it never changes a firewall or a trust setting by itself — those
   need the owner's administrator password and are the owner's steps, printed for them.
3. **HTTPS that phones trust: the laptop's own certificate authority.** The proxy's local authority
   (Caddy's `tls internal`) signs the certificate for the laptop's address. A phone trusts it once it
   has installed and trusted the authority's root. Plain HTTP on the same address serves the trust
   page alone (never the game or the API): the root to download (an iPhone or iPad installs it as a
   profile and turns its trust on; Android installs it as a CA certificate in Settings), the steps in
   Russian and English, and a check that says when the phone trusts the laptop, with "Open the table".
   The start command's QR code opens the trust page; the game's own QR codes (invitations, the table's
   link) open the HTTPS address. The page comes over plain HTTP, so the terminal shows the root's
   SHA-256 fingerprint and the page asks to compare it before trusting. Only a home network's
   address (10/8, 172.16/12, 192.168/16) is accepted. The root lives in the local stack's volume; its key never leaves the
   laptop. A root can vouch for any name, so the trust page says so plainly and how to remove it; it
   is needed only for local play.
4. **Backups stay on the laptop.** The backup service writes to a folder on the laptop
   (`~/Documents/LTW local backups` unless set): every 6 hours and on demand (`ltw-local.sh backup`),
   with the deployment's retention and checksums. Nothing leaves the laptop.
5. **A campaign moves with its history and accounts, and lives in one place at a time.** A move is
   an operator command on each server (`deploy/scripts/campaign-move.sh`; the local command runs both
   ends over the operator's SSH: `ltw-local.sh bring <campaign> --from <host>` and `ltw-local.sh
return <campaign> --to <host>`).
   - **Away.** Exporting for a move marks the campaign away on its server: it is played elsewhere.
     Its history takes no appends (a database trigger), its seats and invitations no new rows, and
     every request that would change it is refused (409 `MOVED`); its screens say where it went and
     since when. Reading stays. Writes that started before the mark finish before the package is cut.
   - **The package** holds the campaign's whole history (its stream, commands and events), the
     table's records (rolls and checks, rests, chat, handouts, notes, marks, saved encounters, the
     library, music and pictures, the table's state and screen), its invitations and seats, and the
     accounts holding those seats (login, password hash, name), so everyone signs in as before.
     Sessions, display devices (a TV pairs again), AI and image spending records and the workshop
     stay with each server.
   - **Importing brings it home.** Where the campaign is new, everything is created. Where it is away
     (it moved from here and comes back), the history here must be the beginning of the package's
     history; the rest of the package's history is appended and the table's records become the
     package's. A campaign at home on the target is never overwritten. An account that exists keeps
     its name and takes the package's password only when that changed later and the account sat in
     this campaign here before (a package never sets a stranger's password); a login someone else
     holds here gets a number added, reported.
   - **Joining an away campaign.** An invitation is not redeemed, claimed or revoked there and no
     seat is taken (409 `MOVED`, before anything is written; the invitations' rows refuse changes
     under the application): a row changed there could never take the package's back.
   - **Cancelled.** A move whose import never happened is cancelled on the server that marked it.
   - A campaign published from the workshop does not move yet: its publication belongs to the
     workshop's records (and its AI is off locally); the export says so.
6. **The package is a secret and a checked file.** Gzip of JSON lines: a header (format, version,
   campaign, the source's last migration, the source, whether it is a move), each table's columns
   and rows, and a SHA-256 of all of it. It holds password hashes: written with mode 600, kept in
   `deploy/local/moves/` (git-ignored) as the move's copy — the newest of each campaign only — never
   sent anywhere but the operator's SSH. A package is as trusted as the server it came from: a
   password it carries is taken only for an account that sat in the campaign here, changed while
   the campaign was away and before the package was cut. The import refuses an unknown table or column, a row of another campaign, a key another
   campaign holds here, a digest that does not match, and history the target cannot read (each event parsed as readiness does), and commits
   all of it or nothing.

## Consequences

- Migration 0039: the moves (`ltw_campaign_moves`, one open move a campaign) and the triggers that
  refuse an away campaign's history, seats and invitations. The HTTP layer refuses a change to an away
  campaign with 409 `MOVED`; the account's campaign list and the game's notice say where it plays. The production proxy keeps its behaviour; its local mode (`LTW_PROXY_MODE=local`) adds the
  trust page and the private-range rule.
- New: `apps/server/src/campaigns/move/` (package, export, import, CLI), `deploy/scripts/campaign-move.sh`,
  `deploy/local/` (the launcher and its terminal QR code), the proxy's trust page
  (`deploy/proxy/trust/`), `deploy/verify/local-mode.sh`, RUNBOOK §15. The deployment's scripts take
  another settings file (`LTW_ENV_FILE`), so the laptop's stack is deployed, backed up and restored
  as the VPS's is.
- The native apps reach the laptop by its address: on an iPhone or iPad the installed and trusted
  root serves the app as it serves Safari; the Android app trusts an installed CA certificate for a
  server off `vardahei.tech` only (its network security configuration), never for the public
  server.
- Verified on this machine with the stack bound to the loopback address: the IP certificate the
  same way a phone sees it, the trust page, a campaign marked away and brought home again through the
  operator's command; between two servers in the integration tests. Opening it to the home network
  is the owner's step at home.

## Invariants affected

None weakened. History stays append-only: a move appends only what the package adds beyond the copy
here, and a diverged history is refused. Knowledge isolation is unchanged (a package is the
operator's, never served to a screen). The World Engine stays the only author of history: the
import copies events the source's engine wrote and reads each before it commits.
