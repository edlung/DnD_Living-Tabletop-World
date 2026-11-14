import sys, collections
from roof import *
def mc(name, cfg, n=400):
    out = collections.Counter(); rounds = []; kl = []
    for seed in range(1000, 1000+n):
        s = Sim(seed, cfg).run()
        e = s.ended[1] if s.ended else 'нет'
        out[e.split(' (')[0]] += 1; rounds.append(s.ended[0] if s.ended else 15); kl.append(s.kl.hp)
    rounds.sort()
    print(f"{name}: " + ", ".join(f"{k} {v*100//n}%" for k, v in out.most_common()) +
          f" | раунд медиана {rounds[n//2]}, мин {rounds[0]}, макс {rounds[-1]} | Клара ср. {sum(kl)/n:.0f}")
if __name__ == '__main__':
    for nm, base in [('ATT', ATT), ('MID', MID), ('NOI', NOI)]:
        for st in ['hold_line', 'engage']:
            for f in ([8, 10] if nm == 'ATT' else [10]):
                c = dict(base, strategy=st, falk=f)
                mc(f"{nm} {st} falk{f}", c)
def smart():
    for nm, base in [('ATT', ATT), ('MID', MID), ('NOI', NOI)]:
        for st in ['engage','hold_line']:
            mc(f"{nm} SMART {st}", dict(base, strategy=st, smart=True, pinner='Конрад'))
