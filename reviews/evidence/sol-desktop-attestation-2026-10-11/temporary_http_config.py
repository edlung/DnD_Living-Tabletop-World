#!/usr/bin/env python3
import argparse,json,hashlib,tomllib
from pathlib import Path
ap=argparse.ArgumentParser();ap.add_argument("mode",choices=["preview","apply","restore"]);a=ap.parse_args()
r=Path(__file__).parent;p=Path.home()/".codex/config.toml";state=r/"config-change.json";backup=r/"config.original.toml"
def digest(b):return hashlib.sha256(b).hexdigest()
if a.mode=="restore":
 m=json.loads(state.read_text());current=p.read_bytes()
 if digest(current)!=m["patchedSha256"]:raise SystemExit("Config changed concurrently; refusing overwrite. Keep backup for manual merge.")
 p.write_bytes(backup.read_bytes());print("Original config restored byte-for-byte.");raise SystemExit()
original=p.read_bytes();s=original.decode();config=tomllib.loads(s)
assert config.get("model_provider","openai")=="openai", "Native OpenAI provider required"
keys=["responses_websockets","responses_websockets_v2"]
lines=s.splitlines(keepends=True);start=next((i for i,l in enumerate(lines) if l.strip()=="[features]"),None)
if start is None:
 s+="\n[features]\n"+"".join(k+" = false\n" for k in keys)
else:
 end=next((i for i in range(start+1,len(lines)) if lines[i].lstrip().startswith("[")),len(lines))
 section=lines[start+1:end]
 for key in keys:
  hits=[i for i,l in enumerate(section) if l.split("=",1)[0].strip()==key]
  if hits:section[hits[0]]=key+" = false\n"
  else:section.append(key+" = false\n")
 lines[start+1:end]=section;s="".join(lines)
patched=s.encode();updated=tomllib.loads(s)
for k in keys:assert updated["features"][k] is False
# Provider, billing, auth and every other parsed configuration value remain unchanged.
oldconfig=dict(config);newconfig=dict(updated);of=dict(oldconfig.get("features",{}));nf=dict(newconfig.get("features",{}))
for k in keys:of.pop(k,None);nf.pop(k,None)
oldconfig["features"]=of;newconfig["features"]=nf
assert oldconfig==newconfig
if a.mode=="preview":
 print(json.dumps({"changes":{k:False for k in keys},"originalSha256":digest(original),"patchedSha256":digest(patched),"applied":False}));raise SystemExit()
if state.exists():raise SystemExit("An existing change record must be restored/resolved first")
backup.write_bytes(original);backup.chmod(0o600)
state.write_text(json.dumps({"path":str(p),"originalSha256":digest(original),"patchedSha256":digest(patched),"changedKeys":keys},indent=2)+"\n");state.chmod(0o600)
p.write_bytes(patched);print("Only the two temporary transport flags changed; provider/auth/billing unchanged.")
