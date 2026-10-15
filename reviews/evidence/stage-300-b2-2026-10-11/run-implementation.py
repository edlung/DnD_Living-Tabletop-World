"""Launch or resume the Stage 300 B2 implementation session (claude-opus-5-5, medium) and write a receipt.

Usage: run-implementation.py start|resume BRIEF_PATH [EFFORT]
"""
from pathlib import Path
import hashlib, json, os, signal, subprocess, sys, time, uuid

root = Path('/tmp/ltw-stage300-checkpoint-b2')
checkout = '/Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2'
mode, brief = sys.argv[1], Path(sys.argv[2])
effort = sys.argv[3] if len(sys.argv) > 3 else 'medium'
if not (root / 'OWNERSHIP_GRANTED').exists():
    raise SystemExit('No checkout ownership grant: implementation remains unstarted.')

env = {k: os.environ[k] for k in ('HOME', 'PATH', 'USER', 'TMPDIR') if k in os.environ}
env.update(LANG='en_US.UTF-8', SHELL='/bin/zsh')
auth = json.loads(subprocess.run(['claude', 'auth', 'status'], capture_output=True, text=True, check=True, env=env).stdout)
if auth.get('apiProvider') != 'firstParty' or auth.get('authMethod') != 'claude.ai' or auth.get('subscriptionType') not in ('max', 'pro'):
    raise SystemExit('Native subscription routing not established.')

sid_file = root / 'session-id.txt'
if mode == 'start':
    if sid_file.exists():
        raise SystemExit('Session already started; use resume.')
    sid = str(uuid.uuid4()); sid_file.write_text(sid + '\n'); selector = ['--session-id', sid]
else:
    sid = sid_file.read_text().strip(); selector = ['--resume', sid]

turn = len(list(root.glob('turn-*'))) + 1
tdir = root / f'turn-{turn:02d}-{mode}'; tdir.mkdir()
args = ['claude', '-p', *selector, '--safe-mode', '--model', 'claude-opus-5-5', '--effort', effort,
        '--output-format', 'stream-json', '--verbose', '--permission-mode', 'dontAsk',
        '--tools', 'Read,Write,Edit,Glob,Grep,Bash', '--allowedTools', 'Read,Write,Edit,Glob,Grep,Bash',
        '--add-dir', str(root), '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}']
start = time.monotonic(); models = set(); result = {}; mismatch = False
with (tdir / 'stderr.txt').open('w') as err, (tdir / 'stream.jsonl').open('w') as out:
    proc = subprocess.Popen(args, cwd=checkout, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=err, text=True, start_new_session=True)
    proc.stdin.write(brief.read_text()); proc.stdin.close()
    for line in proc.stdout:
        out.write(line); out.flush()
        try:
            m = json.loads(line)
        except json.JSONDecodeError:
            continue
        msg = m.get('message')
        model = msg.get('model') if isinstance(msg, dict) and m.get('type') == 'assistant' else None
        if model:
            models.add(model)
            if model != 'claude-opus-5-5':
                mismatch = True; os.killpg(proc.pid, signal.SIGTERM); break
        if m.get('type') == 'result':
            result = m
    code = proc.wait()
(tdir / 'report.txt').write_text(result.get('result', ''))
receipt = {'mode': mode, 'turn': turn, 'exitCode': code, 'requestedModel': 'claude-opus-5-5',
           'responseMessageModels': sorted(models), 'effort': effort, 'identityMismatch': mismatch,
           'elapsedSeconds': round(time.monotonic() - start, 1), 'sessionId': result.get('session_id') or sid,
           'isError': result.get('is_error'), 'usage': result.get('usage'),
           'provider': 'native Anthropic firstParty claude.ai subscription', 'billingChanged': False,
           'rawSha256': hashlib.sha256((tdir / 'stream.jsonl').read_bytes()).hexdigest(),
           'promptSha256': hashlib.sha256(brief.read_bytes()).hexdigest()}
(tdir / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({k: v for k, v in receipt.items() if k != 'usage'}))
print(result.get('result', '')[-6000:])
