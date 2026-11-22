"""Package two verified batches and their paired, pre-edit comparisons for the GM."""
import argparse
from collections import Counter, defaultdict
from hashlib import sha256
import json
from pathlib import Path
import tarfile
import subprocess

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
LABEL={'win':'цель выполнена','partial':'частичный успех','missed':'упущена цель','defeat':'поражение',
       'pursuit':'погоня, +6 минут','withdrawn':'отход с ценой','parley':'сделка'}
NATIVE={'hollowmere':'Колокола Холлоумира','ravenford':'Равенфорд'}
def read(path): return json.loads(path.read_text())
def rows(path): return [json.loads(line) for line in (path/'configurations.jsonl').read_text().splitlines()]
def title(slug):
    if slug in NATIVE:return NATIVE[slug]
    return read(ROOT/'fixtures/campaign-library'/slug/'library.json')['title']
def n(v):return f'{int(v):,}'.replace(',',' ')
def sum_field(rs,k):return sum(r[k] for r in rs)
def counter(rs,field):
    value=Counter()
    for r in rs:value.update(r[field])
    return value
def distribution(c):
    return ' · '.join(f'{LABEL.get(s,s)} {n(v)}' for s,v in c.most_common())
def table(names):
    return ['| '+' | '.join(names)+' |','| '+' | '.join('---' for _ in names)+' |']
def add(l,values):l.append('| '+' | '.join(map(str,values))+' |')
def group(rs,key):
    by=defaultdict(list)
    for r in rs:by[r[key]].append(r)
    return by


def publish(opt):
    out=opt.out;out.mkdir(exist_ok=True,parents=True)
    batches={'проверка':opt.first,'независимая серия':opt.second}
    allrows=[dict(r,series=label) for label,p in batches.items() for r in rows(p)]
    by=group(allrows,'slug')
    catalogs={s:read(opt.first/(s+'.book.json')) for s in by}
    assert len(by)==55 and len(allrows)==662
    assert {(r['slug'],r['edition'],r['history']) for r in rows(opt.first)}=={(r['slug'],r['edition'],r['history']) for r in rows(opt.second)}
    (out/'configurations.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n' for r in allrows))
    campaign=['# 55 кампаний с переносом ресурсов','',
      'Две серии по 32 бросковых сценария на каждый состав и предысторию. В графе старта финала учтены группы, которые смогли начать последнюю боевую встречу. Доли хитов относятся к этому моменту. Ячейки усреднены на всю дошедшую группу. В исходах указаны результаты последнего столкновения. За пределами боя у книги могут оставаться главы и выбор финала.','',
      *table(['Кампания','Составы','Прогоны','Начали последний бой','Хиты при входе','Ячейки при входе','Исходы последнего боя'])]
    for slug in sorted(by,key=title):
        r=by[slug];f=sum_field(r,'reached')
        add(campaign,[title(slug),len(catalogs[slug]['parties']),n(sum_field(r,'runs')),n(f),
                     f"{100*sum_field(r,'hpAtFinal')/sum_field(r,'maxAtFinal'):.0f} %",
                     f"{sum_field(r,'slotsAtFinal')/f:.1f}",distribution(counter(r,'outcomes'))])
    campaign+=['','## Привалы по книгам','',
      'Окна ниже относятся к сыгранному маршруту. Если до следующего боя больше нет переходов, заключительная ночь не добавляет ресурсы к результату. В кампании «Корона из чужих костей» вид привала зависит от остатка запаса. В названиях встреч сохранены ключи игровых карточек.','']
    for slug in sorted(by,key=title):
        b=catalogs[slug];campaign+=['### '+title(slug),'']
        campaign.append('Маршрут проходит через '+', '.join(f'{k} (гл. {ch})' for k,ch in sorted(b['encounters'].items(), key=lambda e:e[1]))+'.')
        campaign.append('')
        if not b['rests']:campaign+=['На выбранном маршруте до последнего боя герои идут без подтверждённого часового привала или ночлега.',''];continue
        seen=set()
        for h in b['rests']:
            target=h.get('key') or ('гл. '+str(h['after'])); t='Долгий' if h['kind']=='long' else 'Короткий'
            line=f"- {t} после {target}. "+h['reason']
            if h.get('history'):line+=' Вариант '+h['history']+'.'
            if line not in seen:campaign.append(line);seen.add(line)
        campaign.append('')
    (out/'campaigns.md').write_text('\n'.join(campaign)+'\n')
    specials=['# Шесть особых финалов','',
        'Одна и та же серия бросков доступна каждой предыстории данного состава. К финалу сохраняются индивидуальные хиты, оставшиеся ячейки и классовые ресурсы дошедших героев. Участники сражения в Знамённом зале назначаются отдельно от тех, кого отправили к другим Домам.','']
    for slug in sorted([k for k,v in catalogs.items() if len(v['histories'])>1],key=title):
        b=catalogs[slug];specials+=['## '+title(slug),'',*table(['Предыстория','Начали финал / стартовали','Осталось хитов','Исходы'])]
        for h,story in b['histories'].items():
            r=[a for a in by[slug] if a['history']==h]
            add(specials,[story,f"{n(sum_field(r,'special'))} / {n(sum_field(r,'runs'))}",
                          f"{100*sum_field(r,'hpAtFinal')/sum_field(r,'maxAtFinal'):.0f} %",distribution(counter(r,'outcomes'))])
        specials.append('')
    (out/'finales.md').write_text('\n'.join(specials)+'\n')
    paired=[]
    for label,past in [('проверка',opt.prior),('независимая серия',opt.prior_second)]:
        original=rows(past)
        for before in original:
            after=next(r for r in by[before['slug']] if r['series']==label and r['edition']==before['edition'] and r['history']==before['history'])
            assert before['runs']==after['runs']
            kept=('runs','reached','closed','outcomes','hpAtFinal','maxAtFinal','slotsAtFinal')
            paired.append(dict(slug=after['slug'],edition=after['edition'],series=label,
                               before={k:before[k] for k in kept},after={k:after[k] for k in kept}))
    (out/'paired.json').write_text(json.dumps(paired,ensure_ascii=False,indent=2)+'\n')
    archive=out/'rolls.tar.gz'
    with tarfile.open(archive,'w:gz',compresslevel=3) as tar:
        for prefix,path in [('set-a',opt.first),('set-b',opt.second),('prior-a',opt.prior),('prior-b',opt.prior_second)]:
            for f in sorted(path.iterdir()):
                if f.name.endswith(('.gz','.book.json')):tar.add(f,arcname=prefix+'/'+f.name)
    keys=['runs','reached','closed','regular','special','dice','joins','spellSpend','restHitDice','deadAtFinal']
    results={k:sum_field(allrows,k) for k in keys}
    results.update(campaigns=len(by),editions=sum(len(b['parties']) for b in catalogs.values()),
                   configurations=len(allrows)//2,encounters=sum(len(b['encounters']) for b in catalogs.values()),
                   rests=dict(counter(allrows,'rests')),items=dict(counter(allrows,'items')),ends=dict(counter(allrows,'endings')),
                   stops={s:sum_field(r,'runs')-sum_field(r,'reached') for s,r in by.items() if sum_field(r,'runs')>sum_field(r,'reached')},
                   sha256=sha256(archive.read_bytes()).hexdigest())
    (out/'totals.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
    rendered=[out/name for name in ('campaigns.md','finales.md','paired.json','totals.json')]
    subprocess.run([ROOT/'node_modules/.bin/prettier','--write',*rendered],check=True)
    print(results)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ('first','second','prior','prior_second','out'):
        parser.add_argument(name,type=Path)
    publish(parser.parse_args())
