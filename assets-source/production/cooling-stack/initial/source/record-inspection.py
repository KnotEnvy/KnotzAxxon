import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT/'evidence'
VIEWED = [
    'structure-front.png',
    'structure-top.png',
    'structure-close.png',
    'structure-contact.png',
    'world-classic-comparison.png',
    'world-modern-comparison.png',
    'world-chase-comparison.png',
    'world-classic-h11-heat-max-prototype.png',
    'world-chase-h11-heat-max-prototype.png',
]
sheets = json.loads((EVIDENCE/'contact-sheets.json').read_text())['sheets']
report = {
    'inspectionType':'Implementation-agent local PNG artifact inspection using view_image; not a formal review or acceptance pass.',
    'reviewStatus':'pending_deferred_opus_review',
    'formalReviewRounds':0,
    'formalFixRounds':0,
    'directlyViewedPNGs':[{'file':name,'sha256':hashlib.sha256((EVIDENCE/name).read_bytes()).hexdigest()} for name in VIEWED],
    'renderedFramesInspectedViaContactSheets':[name for sheet in sheets for name in sheet['sourceFilesInRowMajorOrder']],
    'observations':[
        'Front/top/close and the rear/side contact panels show a continuous tapered shell, actual inset inlet depth, four separated fin courses, service hatch/latch, corner spines, foundation and fitted cap.',
        'Cap heat surface is clean and continuous; underplate supports remain below it. The heat surface preserves the original source bounds and vertical extent.',
        'All 24 world comparison panels were viewed, SOURCE left and PROTOTYPE right, with native source placements and the same original-scale shipped player.',
        'Height7/11 and heat-min/max differences are visible. The other original cooling stack and source world remain unchanged. Modern/Chase show the selected far-shoulder prop at small source-camera scale, not an enlarged comparison object.',
        'No live WebGL, frame-rate, physical collision, or final visual acceptance inference is made from these offline PNGs.',
    ],
    'limitations':[
        'Dark rear/side faces are deliberately shadowed in the offline studio; these are material proxies, not Three mapped-material renders.',
        'The fixture is a synthetic reactor sector descriptor with actual Batch source geometry and no gameplay feature records. Endpoint height/phase render inputs are labeled stubs.',
        'No Opus formal review, fix or polish pass occurred; that work remains deferred.',
    ],
}
(EVIDENCE/'inspection.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'directPNGsViewed':len(VIEWED),'renderedFramesViewedInContactSheets':len(report['renderedFramesInspectedViaContactSheets']),'formalReviewRounds':0,'formalFixRounds':0},indent=2))
