# Recovers a derived placeholder's DM-only label from the frame hue a player can read.
import sys,re
def fnv(text,salt=0):
    h=0x811c9dc5 ^ salt
    for ch in f"{salt}:{text}":
        h^=ord(ch); h=(h*0x01000193)&0xffffffff
    return h
svg=open(sys.argv[1]).read()
hue=int(re.search(r'stroke="hsl\((\d+) ',svg).group(1))
cands="dead dying wounded unconscious night day dawn dusk rain storm fog snow overcast poisoned charmed frightened paralyzed prone stunned restrained invisible blinded petrified destroyed missing transformed vampire undead burned bloody captured".split()
print("frame hue",hue,"-> candidate labels:",[c for c in cands if fnv(c)%360==hue])
