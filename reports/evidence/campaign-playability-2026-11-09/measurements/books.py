# Offline book checks: every local link/img resolves; player pages contain no DM secrets.
import os,re,json,glob,collections,sys,html
sys.path.insert(0,os.path.dirname(__file__))
from corpus import *
HREF=re.compile(r'(?:href|src)="([^"#?]+)')
res=[]
for c in camps():
    d=f'{BASE}/{c}'
    pages=glob.glob(f'{d}/**/*.html',recursive=True)
    broken=[]; external=0
    for p in pages:
        t=open(p,encoding='utf8').read()
        for u in HREF.findall(t):
            if u.startswith(('http:','https:','mailto:','data:')): external+=1; continue
            target=os.path.normpath(os.path.join(os.path.dirname(p),html.unescape(u)))
            if not os.path.exists(target): broken.append((os.path.relpath(p,d),u))
    x=load(c)
    secrets=[]
    w=x['world']; tr=w.get('truth') or []
    secrets+= [t for t in (tr if isinstance(tr,list) else [tr])]
    for n in x['cast'].get('npcs',[]):
        for k in('secret',):
            if n.get(k): secrets.append(n[k])
    for cl in x['clues']:
        if cl.get('statement'): secrets.append(cl['statement'])
    pl=f'{d}/players.html'
    leaks=[]
    if os.path.exists(pl):
        t=html.unescape(open(pl,encoding='utf8').read())
        for s in secrets:
            probe=s[:70]
            if len(probe)>=40 and probe in t: leaks.append(probe)
    nimg=sum(len(re.findall(r'<img\b',open(p,encoding='utf8').read())) for p in pages)
    nsvg=sum(len(re.findall(r'<svg\b',open(p,encoding='utf8').read())) for p in pages)
    res.append(dict(id=c,pages=len(pages),broken=broken,external=external,playersPage=os.path.exists(pl),leaks=leaks,img=nimg,inlineSvg=nsvg))
print('pages',sum(r['pages'] for r in res),'broken',sum(len(r['broken']) for r in res),'external',sum(r['external'] for r in res),'leaks',sum(len(r['leaks']) for r in res))
for r in res:
    if r['broken'] or r['leaks'] or not r['playersPage']: print(r['id'],'broken',r['broken'][:5],'leaks',r['leaks'][:3],'playersPage',r['playersPage'])
print({r['id'].split('/')[0]:r['img'] for r in res})
json.dump(res,open(os.path.join(os.path.dirname(__file__),'books.json'),'w'),ensure_ascii=False)
