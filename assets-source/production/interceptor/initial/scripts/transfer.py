"""One authorized Taildrop attempt; receipt outside immutable initial.
Use --escalated only to record a tool-level approved retry after sandbox denial.
"""
from pathlib import Path
import subprocess,json,datetime,hashlib,sys
BASE=Path(__file__).resolve().parents[2];REC=BASE/'transfer-record.json'
r=json.loads(REC.read_text());archive=Path(r['archive']);assert hashlib.sha256(archive.read_bytes()).hexdigest()==r['archive_sha256']
t={'destination':'100.112.66.64:','expected_auto_receive':'/mnt/c/Users/Knotz2/Downloads/','attempt_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'mode':'approved escalation retry' if '--escalated' in sys.argv else 'default sandbox','notes':'No SSH or credential changes. No receiver-side hash verified.'}
try:
 win=subprocess.run(['wslpath','-w',str(archive)],capture_output=True,text=True,check=True).stdout.strip();cmd=['/mnt/c/Program Files/Tailscale/tailscale.exe','file','cp',win,'100.112.66.64:'];t['command_argv']=cmd
 p=subprocess.run(cmd,capture_output=True,text=True,timeout=90);t.update(returncode=p.returncode,stdout=p.stdout,stderr=p.stderr,status='sent_taildrop_success' if p.returncode==0 else 'failed')
except Exception as e:t.update(status='failed',error=repr(e))
r.setdefault('transfer_attempts',[]).append(t);r['transfer']=t;REC.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(t,indent=2))
