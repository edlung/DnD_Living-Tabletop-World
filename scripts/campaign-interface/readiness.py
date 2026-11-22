"""Verify each party edition against the maps and figures the server actually imports."""
import argparse
from hashlib import sha256
from collections import Counter
from pathlib import Path
from sources import ROOT, CAMPAIGNS, THEMES, read, builtin, authored
from table_art import table_art


def check_files(rows, root):
    for row in rows:
        path = root / (row.get('source') or row['file'])
        content = path.read_bytes()
        assert content[:4] == b'RIFF' and content[8:12] == b'WEBP', path
        assert sha256(content).hexdigest() == row['sha256'], path


def authored_counts(slug):
    folder = ROOT / 'fixtures/campaign-library' / slug
    data = read(folder / 'library.json')
    check_files(data['pictures'], ROOT)
    heroes, foes, grounds, encounters, pins, npcs = (set() for _ in range(6))
    for v in data['variants']:
        id = v['id']
        package = read(folder / v['file'])
        kinds = {e['key']: e['kind'] for e in package['entities']}
        bindings = {}
        for row in data['pictures']:
            for key in row['subjects'].get(id, []):
                assert key in kinds, (slug,id,key)
                bindings.setdefault((key,row['purpose']), []).append(row)
        def needs(key, purpose):
            assert (key,purpose) in bindings, (slug,id,key,purpose)
        for key, kind in kinds.items():
            if kind=='npc':
                needs(key,'image')
                needs(key,'figure')
                npcs.add(key)
        needs('world-map', 'image')
        assert len(package['maps']) == 1, (slug,id)
        for pin in package['maps'][0]['pins']:
            assert kinds.get(pin['place'])=='location', (slug,id,pin)
            pins.add(pin['place'])
        for hero in package['party']:
            needs(hero, 'image')
            needs(hero, 'figure')
            heroes.add(hero)
        for enc in package['encounters']:
            needs(enc['location'], 'battle-map')
            encounters.add(enc['key'])
            grounds.add(enc['location'])
            for combatant in enc['combatants']:
                if combatant['side'] == 'hostile':
                    needs(combatant['entity'],'figure')
                    foes.add(combatant['entity'])
        for key in package['party']:
            assert any(p['holder'] == key for p in package['possessions']), (slug,id,key,'inventory')
    return len(data['variants']), len(pins), len(grounds), len(encounters), len(heroes), len(foes), len(npcs)


def builtin_counts(slug):
    root = ROOT / 'fixtures' / (slug+'-ru')
    data = builtin(slug)
    art = table_art(slug)
    folder=ROOT/'fixtures'/('ravenford-ru' if slug=='ravenford' else 'hollowmere')/'assets'
    check_files(read(folder/'manifest.json')['assets'], folder)
    heroes = {k for k,e in data['entities'].items() if e['kind']=='character'}
    npcs = {k for k,e in data['entities'].items() if e['kind']=='npc'}
    assert npcs <= art['references'].keys() and npcs <= art['figures'].keys(), slug
    encounters = data['encounters']
    foes = {f['entityId'] for enc in encounters for f in enc['foes']}
    grounds = {e['locationId'] for e in encounters}
    assert heroes <= art['references'].keys() and heroes|foes <= art['figures'].keys(), slug
    assert grounds <= art['grounds'].keys(), slug
    pins={p['placeId'] for f in root.glob('*-seed.json') for c in read(f)['commands']
          if c['type']=='SetMapPins' for p in c['pins']}
    assert pins and art['atlas'].is_file(), slug
    return 1,len(pins),len(grounds),len(encounters),len(heroes),len(foes),len(npcs)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--matrix',type=Path)
    args=parser.parse_args()
    themes=read(THEMES/'catalog.json')
    assert {t['id'] for t in themes}==set(read(ROOT/'fixtures/campaign-library/index.json')['campaigns'])|{'ravenford','hollowmere'}
    evidence = ROOT / 'reports/evidence/campaign-phone-runs.json'
    phones = read(evidence) if args.matrix and evidence.is_file() else {}
    widths = {r['id']: f"{r['chromiumWidth']} / {r['webkitWidth']}" for r in phones.get('campaigns', [])}
    lines=['# Комплектность игровых столов', '',
           'Одна строка соответствует одной истории. Для двух встроенных историй учтён русский стол. '
           'Герои и участники встреч посчитаны по их идентификаторам во всех составах. '
           'Несколько противников одного вида могут использовать одну и ту же фигурку.', '',
           '| Кампания | Составы | Метки | Боевые карты | Встречи | Герои с портретом и фигуркой | Противники с фигуркой | NPC с портретом и фигуркой |',
           '|---|---:|---:|---:|---:|---:|---:|---:|']
    if widths:
        lines.insert(-2, f"Телефоны проверены {phones['date']}. Ширина указана в CSS-пикселях для Chromium / WebKit. "
                         "[Записи по всем столам](campaign-phone-runs.json)\n")
        lines[-2] += ' Экран игрока, px |'
        lines[-1] += '---:|'
    totals=Counter()
    for theme in themes:
        slug=theme['id']
        nums=builtin_counts(slug) if slug in ('ravenford','hollowmere') else authored_counts(slug)
        pack=next(iter(CAMPAIGNS.glob('**/'+slug+'/source/world.json')), None)
        source=authored(pack.parents[1]) if pack else builtin(slug)
        references=table_art(slug)['references']
        for key,entity in source['entities'].items():
            if entity['kind']=='location':
                assert key in references,(slug,key,'location painting')
            if entity['kind'] == 'item':
                image=source['art'].get(key) or source['art'].get(source['notes'].get(key,{}).get('art'))
                assert image and image.is_file(), (slug, key, 'item artwork')
        totals.update(dict(zip(['parties','pins','grounds','encounters','heroes','foes','npcs'],nums)))
        cells = [*map(str, nums), *([widths.get(slug, '—')] if widths else [])]
        lines.append('| ['+theme['names'][0]+'](../../campaigns/interface/'+slug+'.html) | '+' | '.join(cells)+' |')
    if args.matrix: args.matrix.write_text('\n'.join(lines)+'\n')
    print(len(themes),dict(totals))


if __name__=='__main__':
    main()
