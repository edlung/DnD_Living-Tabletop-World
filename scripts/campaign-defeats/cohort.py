"""Read the two published series and keep every expedition with a party-wide stop."""
import gzip
import hashlib
import json
import sys
import tarfile
from collections import Counter
from pathlib import Path

BASE = Path('reports/evidence/campaign-endurance-2026-11-22')
ENDINGS = {'no-party-before-final': 12, 'party-down-at-last-fight': 27}


def cases():
    path = BASE / 'rolls.tar.gz'
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    assert digest == json.loads((BASE / 'totals.json').read_text())['sha256']
    rows = []
    all_runs = 0
    with tarfile.open(path, 'r:gz') as archive:
        for member in archive:
            series, filename = member.name.split('/')
            if series not in ('set-a', 'set-b') or not filename.endswith('.jsonl.gz'):
                continue
            slug = filename.removesuffix('.jsonl.gz')
            with gzip.open(archive.extractfile(member), 'rt', encoding='utf8') as data:
                for line in data:
                    run = json.loads(line)
                    all_runs += 1
                    if run['ending'] in ENDINGS:
                        pivot = next(s['key'] for s in reversed(run['steps']) if 'outcome' in s)
                        rows.append(dict(series=series, slug=slug, pivot=pivot, run=run))
    assert all_runs == 21184
    assert Counter(x['run']['ending'] for x in rows) == ENDINGS
    assert len({(x['slug'], r['edition'], r['profile'], r['seed'])
                for x in rows for r in [x['run']]}) == len(rows)
    return rows


if __name__ == '__main__':
    json.dump(cases(), sys.stdout, ensure_ascii=False, separators=(',', ':'))
