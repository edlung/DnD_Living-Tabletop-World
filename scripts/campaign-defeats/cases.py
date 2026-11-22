"""Check each paired entrance and give the GM the result for every party."""
import gzip
import json
import sys
from collections import Counter
from pathlib import Path

POLICIES = ('original', 'control', 'pressure', 'alternative')
WORLDS = {'hollowmere': 'Колокола Холлоумира', 'salt-widows': 'Вдовы соляного моря',
          'hollow-choir': 'Хор Пустых Комнат', 'marrow-crown': 'Корона из чужих костей'}
PLACES = {'sunken-bell': 'Зал колокола', 'cellar-rats': 'Погреб Хобба',
          'drowned-chapel': 'Затонувшая часовня', 'sunken-mill': 'Затопленная мельница',
          'widows-line-hunt': 'Вдовья черта', 'radan-in-brine': 'Днище Радана',
          'niche-guards': 'Ниши Урмов', 'fissure-spinners': 'Свёрток Стася',
          'marsh-lights': 'Огни в топи', 'flooded-stair': 'Затопленная лестница',
          'garden-glass': 'Стеклянный сад','seam-nest': 'Гнездо у шва'}
OUTCOMES = dict(win='цель достигнута', defeat='все на земле', partial='частичный исход',
                withdrawn='отход', parley='сделка', missed='цель упущена', burned='паутина сожжена')
OUTCOMES.update({'prisoners-out': 'пленники выведены', 'east-exit':'выход на восток',
                 'warning-sent': 'весть передана'})
TACTICS = {
    'sunken-bell': ('Встать в H5, откуда герою доступны оба крепления. Боец может потратить оставшийся Всплеск действий.', 'Открыть засов у D3 и довести пленников через A3 к ризнице.'),
    'widows-line-hunt': ('Разойтись по двум подходам в первый раунд, затем метить шов и использовать имеющийся заряд.', 'Идти по восточным вешкам к перевалу. Каждый пересекает край поля отдельно.'),
    'cellar-rats': ('В первый раунд прикрыть товарищей и ударить по ослабленной крысе, затем вернуться к бочке.', 'Собраться у люка и позвать Хобба. Бочкой соли жертвуют, когда крышка закрыта.'),
    'drowned-chapel': ('Сначала ударить по ослабленному противнику, бойцу разрешить Всплеск действий.', 'Срисовать надпись с западных мостков и отказаться от схватки в нефе.'),
    'sunken-mill': ('В первый раунд сосредоточить удары на одной цели и использовать оставшиеся классовые умения.', 'Отступить на западную пристань и прочесть книгу через люк после ухода лодок.'),
    'niche-guards': ('Прикрыть носильщика в первый раунд, затем считать каждого пересёкшего порог к 03:30.', 'Дойти до табличек у алтаря, назвать сторожей и нести ящик к западному люку.'),
    'radan-in-brine': ('Сначала прикрыть подход, затем снимать людей линями.', 'Потратить бочку воды, отвести резунов на три раунда и вытянуть охотников.'),
    'fissure-spinners': ('Прикрыть подход в первый раунд, затем срезать свёрток.', 'Поджечь паутину за единицу запаса и принять порванный свёрток.'),
}


def pivot(row, policy):
    return next(s for s in row[policy]['run']['steps'] if s.get('key') == row['pivot'] and 'outcome' in s)


def label(row):
    history = {'noisy':'шумная','middle':'средняя','route':'основная'}[row['profile']]
    return f"{row['series'][-1].upper()} · {row['seed']} · {row['edition']} · {history}"


def result(row, policy):
    j = row[policy]
    close = j['after']
    outcome = OUTCOMES[pivot(row,policy)['outcome']]
    if close['kind'] in ('stairs','guests'):
        f=close['finale']
        return f"{outcome} → {f['outcome']} ({f['details']['escaped']}/13)"
    if close['key']!=row['pivot'] and close.get('fate'):
        return f"{outcome} → {PLACES[close['key']]}, " + ('есть выжившие' if any(h['status']!='dead' for h in close['fate']) else 'все погибли')
    return outcome+' → '+close['line'].split('. ')[0].rstrip('.') if close['line'] else outcome


def named_fate(j):
    a=j['after']
    names=lambda seq:', '.join(j['entry']['party'][i-1]['name'].split()[0] for i in seq) or 'никого'
    if a['kind']=='guests':
        return f"В Хоре — {names(a['taken'])}. Погибли — {names(a['dead'])}."
    live=[h['seat'] for h in a['fate'] if h['status']!='dead']
    dead=[h['seat'] for h in a['fate'] if h['status']=='dead']
    return f"Выжили — {names(live)}. Погибли — {names(dead)}."


def validate(rows, tables):
    assert len(rows)==len(tables)==39
    assert Counter(r['original']['run']['ending'] for r in rows)=={'no-party-before-final':12,'party-down-at-last-fight':27}
    assert len({(r['slug'],r['edition'],r['profile'],r['seed']) for r in rows})==39
    extra=0
    for r,t in zip(rows,tables):
        assert all(r[k]==t[k] for k in ('slug','edition','profile','seed'))
        policies=[*POLICIES]+(['followup'] if 'followup' in r else [])
        assert [v['policy'] for v in t['views']]==policies
        original=r['original']
        extra+=int('followup' in r)
        for j in (r[p] for p in POLICIES):
            assert j['start']==original['start'] and j['entry']==original['entry']
            n=j['actions'][0]['diceTo']
            assert j['actions'][0]['type']=='StartCombat' and n==original['actions'][0]['diceTo']
            assert j['dice'][:n]==original['dice'][:n]
        for p,v in zip(policies,t['views']):
            j=r[p]
            assert j['after']['line'] and v['playerSeats']==len(j['entry']['party']) and v['privateNotes']>0
            assert all(1<=face<=sides for sides,face in j['dice'])
            if r['pivot'] in ('cellar-rats','fissure-spinners') and p in ('original','control'):
                replies=[c for c in j['actions'] if c['phase']=='care' and c.get('reaction')=='opportunity-attack']
                assert bool(replies)==(p=='original')
            if j.get('special'):
                f=j['after']['finale']
                assert f['details']['rounds']>0 and len(f['exit'])==len(j['entry']['party'])
                assert set(f['details']['takenAtStart'])=={h['name'].split()[0] for h in j['special']['entry']['party'] if h['key'] in j['special']['taken']}
        if 'followup' in r and r['pivot']=='sunken-bell':
            assert r['original']['actions']==r['pressure']['actions']==r['alternative']['actions']
            assert r['followup']['run']['ending']=='bell-silenced'
    assert extra==5


def main():
    out=Path(sys.argv[1])
    with gzip.open(out/'replays.jsonl.gz','rt') as f:
        rows=[json.loads(l) for l in f]
    tables=json.loads((out/'tables.json').read_text())
    validate(rows,tables)
    lines=['# 39 партий после поражения','',
      'Закрытые записи ведущего. A обозначает первую серию, B — вторую. Номер определяет броски. В столбце хитов перечислены все места. Ноль означает потерю сознания, знак † — смерть до входа в сцену. Предыстории с одним номером сохранены отдельными строками.','',
      '## Решения на поле','', '| Сцена | Тактика А | Тактика Б |','|---|---|---|']
    for key,(a,b) in TACTICS.items():
        lines.append(f'| {PLACES[key]} | {a} | {b} |')
    for category,title in [('no-party-before-final','12 партий до финала'),('party-down-at-last-fight','27 партий в финальном бою')]:
        lines+=['','## '+title,'']
        for slug,world in WORLDS.items():
            subset=[r for r in rows if r['slug']==slug and r['original']['run']['ending']==category]
            if not subset:continue
            lines+=['','### '+world,'','| Серия · номер · состав · предыстория | Сцена и хиты на входе | Исход по архиву и что сыграл мастер после | Тактика А | Тактика Б |','|---|---|---|---|---|']
            for r in subset:
                j=r['original'];s=pivot(r,'original')
                hp=', '.join(h['name'].split()[0]+' '+(str(h['hp']) if h['alive'] else '†') for h in j['entry']['party'])
                stop=next((s['key'] for s in j['run']['steps'] if 'stop' in s),None)
                obstacle=f" До сцены «{PLACES[stop]}» отряд не дошёл." if stop else ''
                lines.append(f"| {label(r)} | {PLACES[r['pivot']]} · {hp} | {OUTCOMES[s['outcome']]}, раунд {s['round']}.{obstacle} {j['after']['line']} {named_fate(j)} | {result(r,'pressure')} | {result(r,'alternative')} |")
    lines+=['','## Пять дополнительных решений','']
    for r in rows:
        if 'followup' not in r:continue
        choice=('Ещё у затопленной лестницы отряд пошёл к ризнице.' if r['pivot']=='sunken-bell' else 'После чтения надписи группа вернулась из топи по своим зарубкам длинным протоком.')
        lines.append(f"- {label(r)}. {choice} {r['followup']['after']['line']}")
    (out/'cases.md').write_text('\n'.join(lines)+'\n')
    print(f'{len(rows)} paired entrances and {sum(len(t["views"]) for t in tables)} published outcomes verified')


if __name__=='__main__':
    main()
