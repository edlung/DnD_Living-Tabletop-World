# -*- coding: utf-8 -*-
import json,collections,subprocess,os,sys
sys.path.insert(0,'.')
from matrix_a import A
from matrix_bc import B,C
for e in A: e['tier']='A'
ALL=A+B+C
SCENES={'hour-blocks':5,'con-stages':3,'court-days':2,'fight-nights':4,'wiretap-nights':4,'city-districts':3,'hotel-floors':4,'film-takes':4,'shifts-and-raids':2,'safehouses':3,'trading-days':3,'ports-of-call':3,'stations-and-pursuit':3,'tide-inquiries':3,'night-hours':5,'maze-wings':4,'legs-with-supplies':3,'tides':3,'market-days':4,'giant-rooms':4,'hunt-then-plate':2,'rehearsal-then-raid':2,'seasons-and-raids':2,'half-days':4,'one-night-repeats':3,'cases-of-the-day':3,'translation-sessions':3,'camps':3,'stops':2,'storm-phases':4,'road-stages':3,'plan-then-do':3,'wall-sectors':4,'factions-round':4,'roll-calls':3,'race-legs':2,'raids':3,'hunt-beats':4,'shift-infiltration':3,'seances':2,'river-stations':2,'descent-levels':4,'ball-acts':4,'voyage-days':3,'wards':4,'rescue-calls':2,'school-terms':3,'stride-stages':2,'myth-days':3,'bracket-rounds':3,'farce-acts':4,'hearings':2,'genre-islands':3}
DECIDED={'absent-voters':'chase','counterfeit-spring':'con','false-verdict':'verdict','last-round':'fight','quiet-exchange':'choice','rain-check':'fight','room-608':'trap','seventh-negative':'chase','strike-fund':'fight','white-ash':'escape','velvet-ledger':'contest','lighthouse':'rescue','acorn-express':'chase','moon-pearl':'con','hollow-choir':'escape','thorn-abbey':'fight','winter-caravan':'escape','salt-meridian':'fight','impossible-fair':'contest','small-banner':'chase','storm-kitchen':'contest','dream-orchestra':'fight','dungeon-sanctuary':'fight','three-magicless-days':'rescue','museum-midnight':'puzzle','rain-bureau':'contest','root-city':'fight','basalt-bloom':'escape','red-dune-post':'chase','silent-frequency':'rescue','ash-testament':'fight','clockwork-carnival':'escape','ember-crown':'fight','glass-republic':'choice','last-orbit':'escape','sky-archipelago':'contest','ash-tithe':'fight','bellwether-hollow':'fight','black-sun-forge':'escape','lantern-mere':'ritual','last-ferryman':'individual','marrow-crown':'fight','moth-court':'con','salt-widows':'fight','winter-orchard':'count','dragon-retirement':'rescue','familiar-school':'sabotage','mountain-wedding':'ritual','unwritten-god':'ritual','cedar-tournament':'contest','copper-canyon':'farce','lantern-court':'verdict','paper-sea':'choice'}
ENGINE_RU={'countdown-day':'Один день по часам','long-con':'Долгая афера','courtroom-trial':'Судебный процесс','ring-ladder':'Лестница рингов','wiretap-spy':'Шпионаж на линии','manhunt':'Охота на человека','puzzle-box':'Отель-головоломка','closed-circle':'Запертый круг','labour-siege':'Осада забастовки','hunted-thriller':'Триллер: героев ищут','market-duel':'Биржевая дуэль','sky-voyage':'Воздушное плавание','train-chase':'Погоня на поезде','underwater-mystery':'Подводный детектив','one-night-haunting':'Одна ночь в доме-хищнике','labyrinth-crawl':'Лабиринт по крыльям','survival-trek':'Выживание на перевале','blockade-running':'Прорыв блокады','guild-rivalry':'Война гильдий на ярмарке','miniature-odyssey':'Приключение в гигантском мире','hunt-and-cook':'Охота и поединок поваров','opera-under-siege':'Опера в осаде','inverted-dungeon':'Подземелье против искателей','three-day-crisis':'Три дня без магии','time-loop':'Петля времени','screwball-detective':'Комедийный сыщик','first-contact':'Первый контакт под огнём','volcano-expedition':'Экспедиция на вулкан','desert-post':'Почта через пустыню','storm-rescue':'Спасение в шторм','escort-under-fire':'Конвой свидетеля','caper':'Ограбление казино','war-campaign':'Война за город','political-factions':'Борьба фракций','prison-break':'Побег с орбиты','stage-race':'Гонка по этапам','guerrilla-cells':'Подполье','monster-hunt':'Охота на чудовище','infiltration-sabotage':'Проникновение и диверсия','ghost-bargain':'Сделка с призраком','underworld-odyssey':'Путь по нижнему миру','megadungeon-delve':'Спуск в подземелье','masquerade-heist':'Кража на маскараде','leviathan-voyage':'Охота на левиафана','plague-triage':'Лечебница в эпидемию','rescue-chain':'Цепочка спасений','school-resistance':'Школа сопротивления','colossal-ritual':'Шествие гор','living-myth':'Рождение мифа','tournament':'Турнир','farce':'Фарс','players-as-judges':'Игроки — судьи','genre-hopping':'Острова жанров'}
srd=subprocess.run(['git','-C','/Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2','show','origin/main:packages/rules/src/srd/monsters.json'],capture_output=True,env={**os.environ,'DEVELOPER_DIR':'/Library/Developer/CommandLineTools'}).stdout
srd=json.loads(srd)
def crv(x):
    c=x['challenge']; c=c if not isinstance(c,dict) else (c.get('rating') or c.get('value') or c.get('cr'))
    return float(eval(str(c)))
CR={x['monsterId']:crv(x) for x in srd}
MID={'quiet-exchange':3,'rain-check':6,'seventh-negative':5,'strike-fund':3,'white-ash':2,'velvet-ledger':6,'lighthouse':7,'acorn-express':5,'moon-pearl':8,'hollow-choir':2,'thorn-abbey':6,'winter-caravan':3,'salt-meridian':5,'impossible-fair':6,'small-banner':2,'storm-kitchen':5,'dream-orchestra':3,'dungeon-sanctuary':2,'three-magicless-days':4,'museum-midnight':3,'rain-bureau':6,'root-city':5,'basalt-bloom':3,'red-dune-post':6,'silent-frequency':2,'ember-crown':4,'mountain-wedding':5,'unwritten-god':6,'salt-widows':3,'glass-republic':5,'dragon-retirement':3,'paper-sea':5,'winter-orchard':6,'familiar-school':3,'lantern-court':5,'ash-tithe':3}
errs=[]
for e in ALL:
    slug=e['id'].split('/')[-1]
    e['decidedBy']=DECIDED[slug]
    if slug in MID: e['midpoint']=(MID[slug],e['midpoint'][1])
    e['scenesPerSession']=SCENES[e['rhythm']]
    e['engineRu']=ENGINE_RU[e['engine']]
    for m in e['combat']['foes']+[e['combat']['boss']]:
        if m not in CR: errs.append((slug,'unknown SRD',m))
        elif CR[m]>5: errs.append((slug,'boss too strong',m,CR[m]))
print('count',len(ALL),'tiers',collections.Counter(e['tier'] for e in ALL))
for k in('engine','rhythm','opening','climax'):
    c=collections.Counter(e[k] for e in ALL); d=[x for x,n in c.items() if n>1]
    print(k,'distinct',len(c),'dups',d[:6])
print('errors',errs)
print('decidedBy',collections.Counter(e['decidedBy'] for e in ALL).most_common())
print('scenes per session',sorted(collections.Counter(e['scenesPerSession'] for e in ALL).items()))
print('sessions',sorted(collections.Counter(e['sessions'] for e in ALL).items()))
print('midpoint session',sorted(collections.Counter(e['midpoint'][0] for e in ALL).items()))
ids=sorted(e['id'] for e in ALL)
import glob
base='/Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2/campaigns'
real=sorted([os.path.relpath(os.path.dirname(p),base) for p in glob.glob(base+'/*/package.json')+glob.glob(base+'/*/*/package.json')])
print('missing',set(real)-set(ids),'unknown',set(ids)-set(real))
json.dump(ALL,open(base+'/distinctness/matrix.json','w',encoding='utf8'),ensure_ascii=False,indent=1)
title={}
for e in ALL:
    w=json.load(open(f"{base}/{e['id']}/source/world.json",encoding='utf8')); title[e['id']]=w['title']
lines=['# Карта различий кампаний','','Общий план: у каждой из 53 кампаний свой тип игры, ритм сессий, перелом и финал. Источник для переписывания: [`matrix.json`](matrix.json).','','| Глубина | Кампаний | Что меняется |','| --- | --- | --- |','| A | %d | Полностью новая последовательность игры; название, сеттинг и основные герои остаются |'%sum(e['tier']=='A' for e in ALL),'| B | %d | Переписывается повторяющийся участок и финал |'%sum(e['tier']=='B' for e in ALL),'| C | %d | Финал, ритм сессий и бои; сюжетный каркас остаётся |'%sum(e['tier']=='C' for e in ALL),'','| Кампания | Глубина | Тип игры | Сессий | Сцен в сессии | Как начинается | Перелом | Финал | Чем решается |','| --- | --- | --- | --- | --- | --- | --- | --- | --- |']
DRU={'chase':'погоня','con':'афера','verdict':'приговор','fight':'бой','choice':'жёсткий выбор','trap':'ловушка','escape':'побег','contest':'состязание','rescue':'спасение','puzzle':'головоломка','ritual':'обряд','individual':'личный бросок','count':'подсчёт выживших','sabotage':'диверсия','farce':'фарс'}
for e in ALL:
    lines.append('| **%s** `%s` | %s | %s | %d | %d | %s | сессия %d: %s | %s | %s |'%(title[e['id']],e['id'],e['tier'],e['engineRu'],e['sessions'],e['scenesPerSession'],e['opening'],e['midpoint'][0],e['midpoint'][1],e['climax'],DRU[e['decidedBy']]))
open(base+'/distinctness/MATRIX.md','w',encoding='utf8').write('\n'.join(lines)+'\n')
