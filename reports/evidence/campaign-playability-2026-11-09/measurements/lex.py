from corpus import *
C=[load(c) for c in camps()]
print(len(C),'campaigns;',sum(len(x['sess']) for x in C),'sessions;',sum(len(s.get('scenes',[])) for x in C for s in x['sess']),'scenes')
# TF-IDF on session+scene text (plot-bearing)
docs={x['id']:collections.Counter(bag(' '.join(sess_text(s) for s in x['sess']))) for x in C}
N=len(docs); df=collections.Counter()
for d in docs.values(): df.update(d.keys())
idf={w:math.log(N/df[w]) for w in df}
vec={}
for k,d in docs.items():
    v={w:(1+math.log(n))*idf[w] for w,n in d.items() if idf[w]>0}
    norm=math.sqrt(sum(x*x for x in v.values())); vec[k]={w:x/norm for w,x in v.items()}
def cos(a,b):
    if len(a)>len(b): a,b=b,a
    return sum(x*b.get(w,0) for w,x in a.items())
pairs=[]
ids=list(vec)
for a,b in itertools.combinations(ids,2): pairs.append((cos(vec[a],vec[b]),a,b))
pairs.sort(reverse=True)
print('\nTop 25 cosine similar pairs (TF-IDF of plot text):')
for p in pairs[:25]: print(round(p[0],3),p[1],'|',p[2])
print('\nMedian pair cosine:',round(sorted(p[0] for p in pairs)[len(pairs)//2],4),' max:',round(pairs[0][0],4))
# shingles
def shingles(t,n=8):
    w=tokens(t); return {' '.join(w[i:i+n]) for i in range(len(w)-n+1)}
sh={}
for x in C:
    t=' '.join(sess_text(s)+' '+' '.join(str(s.get(k,'')) for k in('dmNote','ending')) for s in x['sess'])
    sh[x['id']]=shingles(t)
inv=collections.defaultdict(set)
for k,v in sh.items():
    for s in v: inv[s].add(k)
tmpl=collections.Counter()
share=collections.Counter()
for s,where in inv.items():
    if len(where)>=2:
        tmpl[len(where)]+=1
        for a,b in itertools.combinations(sorted(where),2): share[(a,b)]+=1
print('\nShared 8-word shingles by number of campaigns containing them:',sorted(tmpl.items()))
print('Top pairs by shared 8-word shingles:')
for (a,b),n in share.most_common(20): print(n,a,'|',b)
wide=[(s,len(w)) for s,w in inv.items() if len(w)>=5]
wide.sort(key=lambda x:-x[1])
print('\nSamples of text repeated in ≥5 campaigns:')
seen=set()
for s,n in wide[:400]:
    k=' '.join(s.split()[:4])
    if k in seen: continue
    seen.add(k); print(n,'·',s)
    if len(seen)>=30: break
