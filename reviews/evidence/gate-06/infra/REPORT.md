# Gate 06 — team infra (summary of the team's returned report)

Revision 0cc8d8d, images ltw-*:0cc8d8db2411, project ltw-g06-infra, 127.0.0.1:18084/18447, prefix 10.241.5.
Ran: deploy, trust-boundary.sh, backup-now, restore-drill (empty/allow-empty/full), tamper suite,
header probes, secrets scan, watch.sh, rollback refusal. Stack torn down with volumes.

Findings (all Low, no Critical/High/Medium):
- G06-infra-01 Low: postgres runs as root, writable rootfs, default caps (hardening.txt).
- G06-infra-02 Low: no pids_limit on any service.
- G06-infra-03 Low: drill-db has no mem_limit; restores into an unbounded RAM tmpfs.
- G06-infra-04 Low: `latest`/drill default pick dumps by filename sort, not the manifest;
  impossible timestamps (…T999999Z) accepted (backup-tamper.txt). Restore itself still refuses
  unlisted dumps.
- Informational: egress is an unrestricted outbound bridge.

Sound: trust boundary (all PASS; forged XFF ignored), backup verify rejects flipped/truncated/
empty/unlisted dumps, drill canonicality (digest match v305), no secrets in history/logs/env,
Caddy headers (CSP, XFO DENY, no HSTS on internal, 308 from :80), /readyz names only,
rollback refusal, hardening of server/proxy/backup, watch alarms via stdin, operator CLI only via exec.

Limits: rollback across an additive migration / LTW_ALLOW_NEWER_SCHEMA readiness not exercised
(single revision); Docker Desktop coalesces client IPs; drill-db OOM reasoned, not driven.
