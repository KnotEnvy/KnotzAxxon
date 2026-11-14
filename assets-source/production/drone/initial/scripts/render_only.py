"""Resume the exact evidence block without repeating passed technical checks.

Intentionally shares pose definitions and render instructions with verify_render.py;
fresh Blender processes keep the software EEVEE batches economical.
"""
import sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from scene_tools import *
source=(HERE/'verify_render.py').read_text()
exec(compile(source[source.index('def get_asset():'):source.index('def tree(ob):')],str(HERE/'verify_render.py')+' helpers','exec'))
chosen=json.loads((REPORT/'runtime_samples.json').read_text())['chosen']
exec(compile(source[source.index('# Images use reopened editable blend;'):],str(HERE/'verify_render.py')+' image block','exec'))
