"""Verify every seat, transition, seed and finale handoff before counting a campaign."""
from collections import Counter
import gzip
import json
from pathlib import Path
import sys

SPECIAL={'ember-crown':3,'ash-testament':3,'glass-republic':4,'hollow-choir':3,'salt-meridian':3,'rain-check':3}
ROOT=Path(__file__).resolve().parents[2]
def read(path):
    return json.loads(path.read_text())


def lines(path):
    with gzip.open(path,'rt',encoding='utf8') as src:
        for line in src:
            yield json.loads(line)


def total(v):
    return sum(sum(x) if isinstance(x,list) else x for x in v)


def check_state(s):
    n=len(s['hp'])
    assert all(len(s[k])==n for k in ['max','level','hd','slots','sw','surge'])
    assert all(0<=hp<=mx for hp,mx in zip(s['hp'],s['max']))
    assert all(v>=0 for row in s['slots'] for v in row) and min(s['hd'])>=0
    assert all(s['hp'][i-1]==0 for i in s['dead'])
    assert all(q>0 and (charge is None or charge>=0) and 1<=seat<=n for q,charge,seat in s['stock'].values())


def verify_transition(prev,cur):
    if prev is None:
        return
    assert prev['stock']==cur['stock'] and prev['dead']==cur['dead'], (prev,cur)
    for i,lvl in enumerate(cur['level']):
        assert lvl>=prev['level'][i]
        if lvl==prev['level'][i]:
            assert all(prev[k][i]==cur[k][i] for k in ('hp','max','slots','hd','sw','surge')), (prev,cur)
        else:
            assert cur['max'][i]-cur['hp'][i]==prev['max'][i]-prev['hp'][i],(prev,cur)


def identifiers(r):
    return r['edition'],r['profile'],r['seed']


def verify(out, slug, start, count):
    book=read(out/(slug+'.book.json'))
    if slug in ('hollowmere','ravenford'):
        lib=read(ROOT/'fixtures'/(slug+'-ru')/'encounters.json')
        editions={'4-full',*('3-without-'+str(i) for i in range(1,5))}
        keys={e['encounterId'] for e in lib['encounters']}
    else:
        src=ROOT/'fixtures/campaign-library'/slug;lib=read(src/'library.json')
        editions={v['id'] for v in lib['variants']}
        keys=set(book['encounters'])
        for var in lib['variants']:
            package=read(src/var['file'])
            assert {e['key'] for e in package['encounters']}==keys
            assert [h['key'] for h in book['parties'][var['id']]]==package['party']
    profiles=set(book['histories'])
    assert len(profiles)==SPECIAL.get(slug,1) and set(book['parties'])==editions
    assert set(book['encounters'])==keys
    expected={(e,p,i) for e in editions for p in profiles for i in range(start,start+count)}
    received=set(); reached_keys=set(); summaries={}
    entries={}; finales={}
    if slug in SPECIAL:
        for suffix,result in [('entries',entries),('finales',finales)]:
            for r in lines(out/(slug+'.'+suffix+'.gz')):
                k=identifiers(r); assert k not in result;result[k]=r
        assert set(entries)==set(finales)
    used=set()
    for r in lines(out/(slug+'.jsonl.gz')):
        k=identifiers(r); assert k in expected and k not in received,k;received.add(k)
        edition,profile,seed=k
        agg=summaries.setdefault((edition,profile),dict(slug=slug,edition=edition,history=profile,runs=0,
              reached=0,closed=0,regular=0,special=0,dice=0,joins=0,outcomes=Counter(),endings=Counter(),
              encounters={},rests=Counter(),items=Counter(),skips=Counter(),restHitDice=0,spellSpend=0,
              hpAtFinal=0,maxAtFinal=0,slotsAtFinal=0,spentHDBeforeFinal=0,deadAtFinal=0))
        agg['runs']+=1;prev=None; encountered=[]; chapter=0;final_snapshot=None
        last_key=sorted(book['encounters'],key=book['encounters'].get)[-1]
        for i,s in enumerate(r['steps']):
            assert s['ch']>=chapter;chapter=s['ch']
            if 'key' in s:
                key=s['key'];assert key in keys and key not in encountered;encountered.append(key)
                if 'skip' in s:
                    assert slug in SPECIAL;agg['skips'][key]+=1;continue
            before=s['entry'];check_state(before)
            verify_transition(prev,before)
            agg['joins']+=int(prev is not None)
            if 'stop' in s:
                assert i==len(r['steps'])-1
                break
            if 'key' in s:
                reached_keys.add(key)
                scene=agg['encounters'].setdefault(key,dict(rolls=0,outcomes=Counter(),hpIn=0,maxIn=0,slotsIn=0,hpOut=0,slotsOut=0))
                scene['rolls']+=1;scene['hpIn']+=sum(before['hp']);scene['maxIn']+=sum(before['max']);scene['slotsIn']+=total(before['slots'])
                if key==last_key:final_snapshot=before
            if s.get('special'):
                assert k in entries and s['key']==last_key
                h=entries[k]['entry']['party']; f=finales[k];used.add(k)
                assert [(p['hp'],p['slots'],p['level']) for p in h]==list(zip(before['hp'],before['slots'],before['level']))
                assert [p['key'] for p in h]==[a['key'] for a in f['exit']]
                assert f['details']['rounds']>0 and f['dice'] and sum(f['dice'].values())>0
                agg['dice']+=sum(f['dice'].values());agg['special']+=1
                agg['outcomes'][f['outcome']]+=1;scene['outcomes'][f['outcome']]+=1
                scene['hpOut']+=sum(p['hp'] for p in f['exit']);scene['slotsOut']+=total([p['slots'] for p in f['exit']])
                agg['spellSpend']+=total(before['slots'])-total([p['slots'] for p in f['exit']])
                continue
            after=s['exit'];check_state(after);prev=after
            assert set(before['dead']).issubset(after['dead'])
            agg['dice']+=s.get('dice',0)
            if 'rest' in s:
                assert before['stock']==after['stock'] and before['dead']==after['dead']
                if s['rest']=='short':
                    agg['restHitDice']+=total(before['hd'])-total(after['hd'])
                    assert before['slots']==after['slots']  # published rosters have no warlocks
                    assert all(b>=a for b,a in zip(before['hd'],after['hd']))
                agg['rests'][s['rest']]+=1
            if 'outcome' in s:
                assert s['round']>=1 and s['dice']>0 and s['outcome']!='limit'
                agg['regular']+=1;scene['outcomes'][s['outcome']]+=1
                scene['hpOut']+=sum(after['hp']);scene['slotsOut']+=total(after['slots'])
                agg['spellSpend']+=total(before['slots'])-total(after['slots'])
                for e in s['events']:
                    if e['kind'] in ('use','take','trade'):
                        agg['items'][e['kind']+' '+e['item']]+=1
        assert r['chapters']==list(range(1,len(r['chapters'])+1))
        if r['terminal']=='reached':
            assert set(encountered)==keys and final_snapshot
            agg['reached']+=1
            for metric,field in [('hpAtFinal','hp'),('maxAtFinal','max'),('slotsAtFinal','slots')]:
                agg[metric]+=total(final_snapshot[field])
            agg['spentHDBeforeFinal']+=sum(final_snapshot['level'])-sum(final_snapshot['hd'])
            agg['deadAtFinal']+=len(final_snapshot['dead'])
            if k not in finales:agg['outcomes'][r['previousOutcome']]+=1
        else:assert r['ending']=='no-party-before-final'
        if r['ending'] not in ('no-party-before-final','party-down-at-last-fight'):
            assert len(r['chapters'])==len(book['chapters'])
            agg['closed']+=1
        agg['endings'][r['ending']]+=1
        ledger={}
        for ev in r['story']:
            assert ev['from']==ledger.get(ev['item'],0) and ev['to']>=0;ledger[ev['item']]=ev['to']
    assert received==expected and used==set(finales)
    assert reached_keys==keys, (slug,keys-reached_keys)
    return [summaries[k] for k in sorted(summaries)]


def main():
    out=Path(sys.argv[1]);start=int(sys.argv[2]);count=int(sys.argv[3])
    keys=sys.argv[4:]
    rows=[r for slug in keys for r in verify(out,slug,start,count)]
    (out/'configurations.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n' for r in rows))
    print(f'{len(keys)} campaigns, {len(rows)} configurations, {sum(r["runs"] for r in rows)} verified routes')


if __name__=='__main__':
    main()
