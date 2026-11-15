import json,os,glob,re,collections,math,sys,itertools
BASE='/Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2/campaigns'
def camps():
    out=[]
    for coll in sorted(os.listdir(BASE)):
        if not os.path.isdir(f'{BASE}/{coll}'): continue
        if os.path.exists(f'{BASE}/{coll}/package.json'): out.append(coll)
        else:
            for c in sorted(os.listdir(f'{BASE}/{coll}')):
                if os.path.exists(f'{BASE}/{coll}/{c}/package.json'): out.append(f'{coll}/{c}')
    return out
def load(c):
    d=f'{BASE}/{c}/source'
    w=json.load(open(f'{d}/world.json'))
    cast=json.load(open(f'{d}/cast.json'))
    clues=json.load(open(f'{d}/clues.json'))
    hand=json.load(open(f'{d}/handouts.json'))
    enc=json.load(open(f'{d}/encounters.json')) if os.path.exists(f'{d}/encounters.json') else []
    sess=[]
    for f in sorted(glob.glob(f'{d}/sessions-*.json'))+sorted(glob.glob(f'{d}/act-*.json')):
        j=json.load(open(f))
        sess+= j if isinstance(j,list) else (j.get('chapters') or j.get('sessions') or [])
    sess.sort(key=lambda s:s['number'])
    return dict(id=c,world=w,cast=cast,clues=clues,hand=hand,enc=enc,sess=sess)
def sess_text(s):
    parts=[s.get('title',''),s.get('goal',''),s.get('readAloud','')]
    for sc in s.get('scenes',[]):
        parts+=[sc.get('title',''),sc.get('play','')]+list(sc.get('choices',[]))
    return ' '.join(p for p in parts if p)
WORD=re.compile(r"[а-яёa-z0-9]+")
def tokens(t): return WORD.findall(t.lower().replace('ё','е'))
STOP=set('и в во не на но а что как это с со по к ко у о об от до из за для при над под же ли бы то так или ни их его ее ей им ему они он она оно мы вы я ты все всё весь вся эти этот эта есть был была было были будет будут быть может можно нужно надо если когда где кто чем тем себя свой своя свои своих ваш ваша ваши вас вам нас нам один одна одно одни два две три'.split())
def stem(w): return w[:6] if len(w)>6 else w
def bag(t): return [stem(w) for w in tokens(t) if w not in STOP and len(w)>2]
