from corpus import *
import json,re,glob,os,hashlib,collections
run={}
for l in open('final-head.jsonl'):
    d=json.loads(l); 
    if d['package'].endswith('package.json'): run[d['package'].replace('/package.json','').replace('package.json','')]=d
QUOTE=re.compile(r'«[^»]{3,}»')
rows=[]
for c in camps():
    x=load(c); p=json.load(open(f'{BASE}/{c}/package.json')); w=x['world']
    ents=p['entities']
    items=[e for e in ents if e['kind']=='item']
    kits=[e for e in items if re.search(r'(набор|travel-kit)',(e['key']+' '+e['name']).lower())]
    realItems=len(items)-len(kits)
    foe=[e for e in ents if e['kind']=='creature']
    blocks={json.dumps({k:v for k,v in e['statBlock'].items() if k!='hitPoints'},sort_keys=True,ensure_ascii=False) for e in foe}
    bf={json.dumps(e['battlefield'],sort_keys=True) for e in p['encounters']}
    pngs=glob.glob(f'{BASE}/{c}/assets/*.png')
    sess=x['sess']; scenes=sum(len(s.get('scenes',[])) for s in sess)
    words=sum(len(sess_text(s).split()) for s in sess)
    # dialogue: direct-speech lines in scene play/readAloud
    quotes=0; npcsQuoted=set()
    npcn=[n.get('name','').split()[0] for n in x['cast'].get('npcs',[])]
    for s in sess:
        t=' '.join([s.get('readAloud','')]+[sc.get('play','') for sc in s.get('scenes',[])])
        q=QUOTE.findall(t); quotes+=len(q)
        for n in npcn:
            if n and re.search(n[:5]+r'\w*[^.!?]{0,60}«',t): npcsQuoted.add(n)
    full=all(s.get('readAloud') and s.get('dmNote') for s in sess)
    endings=len(w.get('endings') or [])
    r=run.get(c) or {}
    rows.append(dict(id=c,sessions=len(sess),scenes=scenes,kwords=round(words/1000,1),heroes=len(x['cast'].get('heroes',[])),npcs=len(x['cast'].get('npcs',[])),locations=sum(1 for e in ents if e['kind']=='location'),clues=len(x['clues']),handouts=len(x['hand']),gptArt=len(pngs),items=len(items),realItems=realItems,encounters=len(p['encounters']),foeBlocks=len(blocks),battlefields=len(bf),quests=len(p['quests']),qActive=r.get('questsActive'),qDone=r.get('questsCompleted'),quotes=quotes,npcsQuoted=len(npcsQuoted),npcsTotal=len(npcn),readAloud=full,endings=endings,level=p['brief'].get('partyLevel'),progression=bool(w.get('progression'))))
json.dump(rows,open('matrix.json','w'),ensure_ascii=False,indent=0)
h=['id','sess','scn','kw','her','npc','loc','clu','hnd','ART','ITM','real','enc','blk','map','Q','act','don','quot','npcQ']
print(' | '.join(h))
for r in rows:
    print(' | '.join(str(v) for v in [r['id'],r['sessions'],r['scenes'],r['kwords'],r['heroes'],r['npcs'],r['locations'],r['clues'],r['handouts'],r['gptArt'],r['items'],r['realItems'],r['encounters'],r['foeBlocks'],r['battlefields'],r['quests'],r['qActive'],r['qDone'],r['quotes'],f"{r['npcsQuoted']}/{r['npcsTotal']}"]))
