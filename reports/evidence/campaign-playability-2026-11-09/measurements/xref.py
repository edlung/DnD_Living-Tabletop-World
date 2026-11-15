from corpus import *
import json,collections
tot=collections.Counter(); problems=[]
for c in camps():
    x=load(c); w=x['world']
    locs={l['key'] for l in w.get('locations',[])}
    npcs={n['key'] for n in x['cast'].get('npcs',[])}
    heroes={h['key'] for h in x['cast'].get('heroes',[])}
    clues={k['key'] for k in x['clues']}
    hand={k['key'] for k in x['hand']}
    usedC=set(); usedN=set(); usedH=set(); usedL=set()
    for s in x['sess']:
        usedL.add(s.get('location'))
        for k,g,u,lab in (('clues',clues,usedC,'clue'),('participants',npcs|heroes,usedN,'npc'),('handouts',hand,usedH,'handout')):
            for v in s.get(k,[]) or []:
                u.add(v)
                if v not in g: problems.append((c,s['number'],lab,v)); tot['badref:'+lab]+=1
        if s.get('location') not in locs: problems.append((c,s['number'],'location',s.get('location'))); tot['badref:location']+=1
    for name,all_,used in (('clue',clues,usedC),('handout',hand,usedH),('npc',npcs,usedN)):
        o=all_-used
        if o: tot['orphan:'+name]+=len(o); problems.append((c,'-','orphan-'+name,sorted(o)[:5]))
    for k in x['clues']:
        if k.get('location') not in locs: problems.append((c,'-','clue-loc',k['key']))
    e=w.get('endings') or []
    if len(e)<3: tot['fewEndings']+=1; problems.append((c,'-','endings',len(e)))
    last=x['sess'][-1]
    if not (last.get('ending') or last.get('end')): problems.append((c,'-','noLastEnding',1))
print(dict(tot)); 
for p in problems[:50]: print(p)
print('endings histogram',collections.Counter(len(load(c)['world'].get('endings') or []) for c in camps()))
