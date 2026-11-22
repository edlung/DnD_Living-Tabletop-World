"""Play the six final tables from the living roster that arrived at the door."""
from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
import random
import sys
from unittest.mock import patch


class Roster:
    """An adapter can spend only the slots and features on the imported character sheet."""
    def __init__(self, row):
        self.party = row['entry']['party']
        self.by_name = {h['name'].split()[0]: h for h in self.party}
        self.by_key = {h['key']: h for h in self.party}
        self.bound = {}

    def bind(self, unit, identity, class_id=None):
        h = self.by_key.get(identity) or self.by_name[identity]
        assert not class_id or h['class'] == class_id, (identity, h['class'], class_id)
        assert h['key'] not in self.bound
        unit.hp = h['hp']
        if hasattr(unit, 'max'):
            unit.max = h['max']
        if hasattr(unit, 'maxhp'):
            unit.maxhp = h['max']
        unit.ac = h['ac']
        caps = {'hw': h['slots'][0] if 'healing-word' in h['spells'] else 0,
                'misty': h['slots'][1] if 'misty-step' in h['spells'] else 0,
                'ms': h['slots'][1] if 'misty-step' in h['spells'] else 0,
                'sw': h['sw'], 'surge': h['surge']}
        limits = {}
        for name, limit in caps.items():
            if hasattr(unit, name):
                if isinstance(getattr(unit, name), bool):
                    limit = bool(limit)
                setattr(unit, name, limit)
                limits[name] = limit
        if h['hp'] <= 0 or 'unconscious' in h.get('conditions', []):
            for name, value in dict(down=True, fallen=True, out=True, up=False).items():
                if name in vars(unit):
                    setattr(unit, name, value)
        if not h['alive']:
            for name, value in dict(on=False, present=False, gone=True).items():
                if name in vars(unit):
                    setattr(unit, name, value)
        self.bound[h['key']] = (unit, limits)
        return limits

    def finish(self):
        result = []
        for h in self.party:
            slots = h['slots'][:]
            unit, caps = self.bound.get(h['key'], (None, {}))
            spent = {k: int(v)-int(getattr(unit,k)) for k,v in caps.items()}
            assert all(x >= 0 for x in spent.values()), spent
            slots[0] -= spent.get('hw',0)
            slots[1] -= spent.get('misty',0)+spent.get('ms',0)
            hp = max(0,unit.hp) if unit else h['hp']
            assert 0 <= hp <= h['max'] and min(slots) >= 0 and (h['alive'] or hp == 0), h
            result.append(dict(key=h['key'],hp=hp,slots=slots,sw=h['sw']-spent.get('sw',0),
                               surge=h['surge']-spent.get('surge',0)))
        return result


def ember(row, team, n, seed, prior):
    import final_rerun as f
    d=f.dawn(dict(balanced='понемногу',gates='ворота',abandoned='бросил низ')[row['profile']],False)
    d['zharovnya_silent']=prior['catapult-sortie']=='win'
    if prior['catapult-sortie'] not in ('win','bypass'):
        d['gates']=max(0,d['gates']-1)
    d['chain']='intact' if prior['forge-passage']=='win' else 'broken'
    if prior['coal-tower-breach']=='win':
        d['unevacuated_breach']=False
    if prior['water-tower-night'] not in ('win','bypass'):
        d['market']=max(0,d['market']-1)
    rd,policy=next(iter(f.READINGS.values()))
    b=f.g.Battle(n,d,rd,dict(f.g.policy(d),**policy))
    b.banner_up=False; b.stair_emptied=0; b.dead_states=[]
    for h in b.heroes:
        team.bind(h,h.name,h.kind)
    b.run()
    return f.g.outcome(b,d),dict(rounds=b.round,gates=d['gates'],chain=d['chain'],
                                 artillerySilent=d['zharovnya_silent'],alliance=d['alliance'],cause=b.why)


def ash(row, team, n, seed, prior):
    import box_tune as f
    from dataclasses import replace
    t=f.P.TABLES[dict(careful='осторожный',middle='средний',hurried='худший')[row['profile']]]
    if prior['ferry-cable'] not in ('win','bypass'):
        t=replace(t,gap=max(0,t.gap-1))
    rules=f.B.BoxRules(integ=14,dmg='1d8+1',douse=2,xbow_round1=False,zaslon_total=1,kit_douse=True)
    sim=f.B.BoxSim(n,t,f.P.Policy(route='spine'),rules,random.Random(seed),f.P.load_foe_cells(n,f.ROOT))
    for h in sim.units:
        if h.side=='H':
            team.bind(h,h.key,h.kind)
    if not sim.carrier.active:
        sim.drop_at(sim.carrier.pos)
    res=sim.run()
    return res['outcome'],dict(rounds=sim.round,ending=res['ending'],box=res['integ_left'],
                               gap=t.gap,receipt=t.receipt,boat=t.boat)


def choir(row, team, n, seed, prior):
    import sim as f
    profile=row['profile']; st=row['stores']
    t=dict(f.ARCH[profile])
    if prior['first-supper'] in ('missed','defeat') and 'Дорота' not in t['taken']:
        t['taken']=[*t['taken'],'Дорота']
    with patch.dict(f.ARCH,{profile:t}):
        g=f.Game(profile,n,profile!='noisy',f.V2)
    for h in g.heroes:
        team.bind(h,h.name,h.cls)
    missing={h['name'].split()[0] for h in team.party if not h['alive']}
    g.heroes=[h for h in g.heroes if h.name not in missing]
    g.people=[p for p in g.people if p.name not in missing]
    absent=set(row.get('taken', []))
    taken_names={h['name'].split()[0] for h in team.party if h['key'] in absent}
    for h in g.heroes:
        if h.name in taken_names:
            h.st='gone'; h.row=None; h.candle=None
            g.pullable.append(h)
    # The group without a key enters later. Leave captured people in the
    # Choir until a character at a niche actually pulls them out.
    place=g.place
    def place_free_people():
        heroes=g.heroes
        g.heroes=[h for h in heroes if h.st!='gone']
        try:
            place()
        finally:
            g.heroes=heroes
    g.place=place_free_people
    g.spares=st.get('обычные свечи',0);g.urm=st.get('свечи Урмов',0);g.matches=st.get('спички',0)
    res=g.run()
    return dict(top='Больше, чем он съел',mid='Сколько унесли',bad='Дом сыт')[res['end']],dict(
        rounds=res['rounds'],escaped=res['O'],guests=res['guests_out'],matches=g.matches,
        spares=g.spares,urm=g.urm,hunger=t['hunger'],key=g.key,
        **({'heroesAtGate':[h.name for h in g.heroes if h.st=='out'],
            'takenAtStart':sorted(taken_names)} if absent else {}))


def glass(row, team, n, seed, prior):
    import sim_final as f
    tname=dict(city='Б «город»',middle='С «середина»',late='А «поздно понял»',general='В «генерал»')[row['profile']]
    from copy import deepcopy
    t=deepcopy(f.TABLES[tname])
    if prior['white-thread-cordon'] not in ('win','bypass'):
        t['h']['TD']=max(0,t['h']['TD']-1)
        if t['glass']['TD']=='S':
            t['glass']['TD']='H'
    cls=f.U
    def pieces(kind,pos,**kw):
        u=cls(kind,pos,**kw)
        if kind=='hero':
            team.bind(u,u.key,u.cls)
        return u
    with patch.object(f,'U',pieces):
        night=f.Night(t,n,f.greedy_for(tname),next(iter(f.READINGS.values())))
        night.heroes=[h['key'] for h in team.party if h['alive'] and h['hp']>0 and 'unconscious' not in h.get('conditions',[])]
        end=night.run()
    fr=night.fightres
    return dict(General='Знамёна генералу',White='Белый мандат',Square='Площадь читает списки')[end],dict(
        rounds=fr['rounds'],key=fr['key'],taken=fr['taken'],fell=fr['allfell'],balcony=night.choice,
        glasses=t['glass'],options=night.opts)


def salt(row, team, n, seed, prior):
    import sim as f
    cfg=dict(f.BASE);cfg.update(list(f.TABLES.values())[dict(quiet=0,middle=1,loud=2)[row['profile']]])
    cfg.update(players=n,policy='wait',R_drop='held',R_late='flags_stay',fix='mate',R_aground='spent',reckless=False)
    class Crew(f.C):
        def __init__(self,name,kind,hp,ac,im,side):
            super().__init__(name,kind,hp,ac,im,side)
            if side=='hero':
                self.bounds=team.bind(self,name,kind)
                self.dead=not team.by_name[name]['alive']
        def heal(self,n):
            if not getattr(self,'dead',False):
                super().heal(n)
        def __setattr__(self,name,value):
            if name in self.__dict__.get('bounds',{}):
                value=min(self.bounds[name],value)
            super().__setattr__(name,value)
    with patch.object(f,'C',Crew):
        res=f.run(cfg)
    return res['ending'],dict(rounds=res['rounds'],ships=res['passed'],alarm=cfg['alarm'],
                              reef=cfg['reef'],book=cfg['book'],signal=res['sig_round'])


def rain(row, team, n, seed, prior):
    import roof2 as f
    cfg=dict(dict(attentive=f.ATT2,middle=f.MID2,noisy=f.NOI2)[row['profile']],n=n,
             per_team=1 if n==3 else 2 if n<=5 else 3)
    if prior['depot-shot'] in ('defeat','missed'):
        cfg.update(trust=False,wounds=min(2,cfg['wounds']))
    sim=f.Sim2(seed,cfg,verbose=False)
    for h in sim.heroes:
        team.bind(h,h.name)
    sim.run()
    return sim.ended[1],dict(rounds=sim.ended[0],trust=cfg['trust'],words=cfg['words'],
                             wounds=cfg['wounds'],falk=sim.cfg['falk'])


ADAPTERS={'ember-crown':ember,'ash-testament':ash,'hollow-choir':choir,'glass-republic':glass,
          'salt-meridian':salt,'rain-check':rain}


def main():
    out=Path(sys.argv[1]);slug=sys.argv[2];sys.argv=[sys.argv[0],'1']
    sys.path.insert(0,str(next(Path('reports/evidence').glob(slug+'-rework-*/finale-sim')).resolve()))
    dest=out/(slug+'.finales.gz')
    with gzip.open(out/(slug+'.entries.gz'),'rt') as src,gzip.open(dest,'wt',encoding='utf8') as dst:
        for line in src:
            r=json.loads(line); team=Roster(r)
            seed=int.from_bytes(hashlib.sha256(f"{slug}/{r['edition']}/{r['key']}/{r['seed']}".encode()).digest()[:8],'little')
            random.seed(seed)
            try:
                counts=Counter()
                base=random.Random
                class Counted(base):
                    def randint(self,low,high):
                        if low==1:
                            counts[high]+=1
                        return super().randint(low,high)
                original=random.randint
                def counted(low,high):
                    if low==1:
                        counts[high]+=1
                    return original(low,high)
                with patch.object(random,'Random',Counted),patch.object(random,'randint',counted):
                    outcome,details=ADAPTERS[slug](r,team,len(team.party),seed,dict(r['previous']))
                guests_alone=(slug=='hollow-choir' and bool(r.get('taken')) and
                              all(not h['alive'] or h['key'] in r['taken'] for h in team.party))
                assert counts or (guests_alone and details['escaped']==0 and details['rounds']>0), \
                    'a contested specialist run must contain dice'
                if slug!='glass-republic':
                    assert len(team.bound)==len(team.party)
                result=dict(edition=r['edition'],profile=r['profile'],seed=r['seed'],outcome=outcome,
                            details=details,dice=dict(counts),exit=team.finish())
            except Exception as e:
                raise RuntimeError((slug,r['edition'],r['profile'],r['seed'])) from e
            dst.write(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')


if __name__=='__main__':
    main()
