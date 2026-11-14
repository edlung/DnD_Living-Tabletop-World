from corpus import *
import textwrap
def cut(t,n):
    w=str(t).split()
    return ' '.join(w[:n])+('…' if len(w)>n else '')
out=[]
total=0
for c in camps():
    x=load(c); w=x['world']
    lines=[f"\n## {c} — {w.get('title')}"]
    for k in ('genre','audience','tone'):
        if w.get(k): lines.append(f"{k}: {cut(w[k],16)}")
    lines.append('pitch: '+cut(w.get('pitch',''),70))
    tr=w.get('truth') or []
    if isinstance(tr,list): lines.append('truth (DM): '+' / '.join(cut(t,28) for t in tr[:4]))
    else: lines.append('truth (DM): '+cut(tr,80))
    e=w.get('endings') or []
    if e: lines.append('endings: '+' | '.join(cut(i.get('title','')+': '+i.get('outcome',''),18) for i in e))
    for s in x['sess']:
        sc=' ; '.join(i.get('title','') for i in s.get('scenes',[]))
        lines.append(f"S{s['number']} «{s.get('title')}» goal: {cut(s.get('goal',''),30)} || scenes: {sc} || end: {cut(s.get('ending') or s.get('end') or '',20)}")
    out.append('\n'.join(lines))
txt='\n'.join(out)
open('extract-all.md','w').write(txt)
print(len(txt),'chars',len(txt.split()),'words')
print(txt[:1800])
