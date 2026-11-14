import json,glob,collections,sys
rows=[json.loads(l) for f in sorted(glob.glob(sys.argv[1])) for l in open(f)]
print('packages',len(rows))
print('fatal',[ (r['package'],r['fatal'][:200]) for r in rows if r.get('fatal')][:6])
print('exploreFail',[(r['package'],r.get('exploreError','')[:300]) for r in rows if r.get('exploreOk') is False][:6])
def tot(k): return sum(r.get(k,0) or 0 for r in rows)
print({k:tot(k) for k in('seatSheets','seatInventory','locationsEntered','cluesFound','npcTalks','npcAskOffered','npcAskAccepted','questsDefined','questsActive','questsCompleted')})
print('locFail',sum(len(r.get('locationsFailed',[])) for r in rows),'clueFail',sum(len(r.get('cluesFailed',[])) for r in rows),'npcFail',sum(len(r.get('npcTalkFailed',[])) for r in rows),'noTopics',sum(len(r.get('npcNoTopics',[])) for r in rows))
for r in rows:
    if r.get('cluesFailed') or r.get('npcTalkFailed') or r.get('locationsFailed'):
        print('!',r['package'],r.get('locationsFailed',[])[:2],r.get('cluesFailed',[])[:2],r.get('npcTalkFailed',[])[:2]); 
inc=[(r['package'],r['questsDefined'],r['questsCompleted']) for r in rows if r.get('questsDefined')!=r.get('questsCompleted')]
print('quests not all completed:',len(inc),inc[:12])
print({k:collections.Counter(str(r.get(k)) for r in rows).most_common(4) for k in('questNoFeature','questNoEvidence','questUnhandled','npcContextFail')})
F=[dict(x,package=r['package']) for r in rows for x in r.get('fights',[])]
print('fights',len(F),'errors',sum(1 for x in F if x.get('error')),'stuck',sum(1 for x in F if x.get('stuck')),'wins',sum(1 for x in F if x.get('victory')),'endCombatRejected',sum(1 for x in F if x.get('endCombat')=='rejected'),'rejectedCmds',sum(x.get('rejected',0) or 0 for x in F))
print(collections.Counter(x.get('error','')[:80] for x in F if x.get('error')).most_common(8))
print('enterFail',collections.Counter((x.get('enterFail') or '')[:80] for x in F if x.get('enterFail')).most_common(4))
print('lastReject',collections.Counter((x.get('lastReject') or '')[:120] for x in F if x.get('lastReject')).most_common(6))
import statistics as st
def group(x):
    p=x['package']; 
    return p.split('/')[0]
by=collections.defaultdict(list)
for x in F:
    if x.get('victory') is not None: by[group(x)].append(x)
for g,xs in sorted(by.items()):
    print(g,'n',len(xs),'win%',round(100*sum(1 for x in xs if x['victory'])/len(xs)),'rounds med',st.median(x['rounds'] for x in xs),'hpLeft% med',st.median(x['partyHpLeftPct'] for x in xs),'hpLeft% min',min(x['partyHpLeftPct'] for x in xs),'heroes down avg',round(st.mean(x['heroes']-x['heroesUp'] for x in xs),2))
losses=[x for x in F if x.get('victory') is False]
print('losses',len(losses),[ (x['package'],x['title'],x['size'],x['seed']) for x in losses][:10])
