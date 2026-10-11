#!/usr/bin/env python3
import argparse,json,sqlite3,hashlib
from pathlib import Path
ap=argparse.ArgumentParser();ap.add_argument("--thread",required=True);ap.add_argument("--turn");ap.add_argument("--log",type=Path,action="append",default=[]);ap.add_argument("--output",type=Path,required=True);a=ap.parse_args()
home=Path.home()/".codex";db=sqlite3.connect((home/"state_5.sqlite").as_uri()+"?mode=ro",uri=True)
row=db.execute("SELECT rollout_path,originator,model_provider FROM threads WHERE id=?",(a.thread,)).fetchone();db.close()
if not row:raise SystemExit("Thread not found")
rollout=Path(row[0]);usage={};turn_config={}
for line in rollout.open():
 m=json.loads(line);p=m.get("payload",{})
 if m.get("type")=="token_usage_record":usage[p["response_id"]]={"turn_id":p.get("turn_id"),"timestamp":m.get("timestamp")}
 if m.get("type")=="turn_context":turn_config[p["turn_id"]]={"requestedModel":p.get("model"),"requestedEffort":p.get("effort")}
def events(text):
 # Trace text is diagnostic input, never evidence unless a complete JSON event parses.
 candidates=[text]
 try:
  obj=json.loads(text)
  if isinstance(obj,dict):
   candidates += [v for v in obj.get("fields",{}).values() if isinstance(v,str)]
   candidates += [obj[k] for k in ("message","text") if isinstance(obj.get(k),str)]
 except (ValueError,TypeError):pass
 dec=json.JSONDecoder()
 for s in candidates:
  marker=s.find("SSE event:")
  if marker<0:continue
  tail=s[marker+len("SSE event:"):].lstrip()
  pos=tail.find("{")
  if pos<0:continue
  try:evt,_=dec.raw_decode(tail[pos:])
  except ValueError:continue
  if isinstance(evt,dict) and evt.get("type") in ("response.created","response.completed"):yield evt
found={};sources=[]
for path in a.log:
 if not path.exists():continue
 sources.append({"path":str(path),"sha256":hashlib.sha256(path.read_bytes()).hexdigest()})
 for line in path.open(errors="replace"):
  for evt in events(line):
   r=evt.get("response",{});rid=r.get("id")
   if rid not in usage:continue
   model=r.get("model");effort=(r.get("reasoning") or {}).get("effort")
   if not isinstance(model,str):continue
   config=turn_config.get(usage[rid]["turn_id"],{})
   found[(rid,evt["type"]) ]={"response_id":rid,"event":evt["type"],"serverModel":model,"serverEffort":effort,"status":r.get("status"),**usage[rid],**config}
records=sorted(found.values(),key=lambda v:(v["timestamp"],v["response_id"],v["event"]))
expected={rid:v for rid,v in usage.items() if a.turn is not None and v["turn_id"]==a.turn}
records=[v for v in records if v["response_id"] in expected]
completed=[v for v in records if v["event"]=="response.completed"]
coverage=bool(expected) and all((rid,event) in found for rid in expected for event in ("response.created","response.completed"))
valid=coverage and all(v["serverModel"]=="gpt-6.1-sol" and v["serverEffort"]=="xhigh" for v in records)
result={"thread_id":a.thread,"originator":row[1],"provider":row[2],"rolloutSha256":hashlib.sha256(rollout.read_bytes()).hexdigest(),"sources":sources,"serverResponseMetadata":records,"completedResponsesWithMetadata":len(completed),"completedTranscriptResponses":len(usage),"selectedTurn":a.turn,"expectedTurnResponses":len(expected),"completeCreatedAndCompletedCoverage":coverage,"allCompletedMetadataMatchSolXhigh":valid,"warning":"A subset does not attest uncaptured responses. Inspect exact review turn coverage and native ChatGPT auth separately."}
a.output.write_text(json.dumps(result,indent=2)+"\n")
print(json.dumps({k:result[k] for k in ["thread_id","completedResponsesWithMetadata","completedTranscriptResponses","allCompletedMetadataMatchSolXhigh"]}))
raise SystemExit(0 if valid else 2)
