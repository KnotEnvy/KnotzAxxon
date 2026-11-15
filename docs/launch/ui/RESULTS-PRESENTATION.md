# Short-screen results and clean flight transition

Owner: Opus High; primary integration2026-11-15. Base67125f6, runtime source
e1623af9d9da402d89b80adfb0cef43a9a4e1b6c98c9df7f01eb0c7764c7236a.
After runtime sourcef35524e9b88d693884763838c8691da2b2c28d22e2a4a7bba6f6f440b5b22790
(96files). Screens.js/style/index and4new behavior tests are byte-identical to
Opus's hardware-tested staging copy; primary checked exact file bytes and patch
b6338bea5d7ec6f016ec538e98c1ae031cca719a4b922d8faff48af695789fbb.

The actual live pilot revealed two defects: sticky action selection scrolled the
outcome heading above short viewports, and the screen fade overlapped a new flight.
The patch preserves sticky actions without scrolling to their static position,
starts new panels at the heading, adds sector/total/record context, and cuts outgoing
screens when flight begins. It preserves callsign/Continue/restored panel position
and reduced-motion behavior. No Game/world/audio code changed.

18staged hardware comparisons on NitroBliss GTX1650Ti/D3D11 Chrome157.0.8103.52
covered victory/defeat at960x540,667x375touchDPR2,390x844touchDPR2,1280x720,
plus two final summary-wrapping checks. Heading/summary and actions are visible and
uncovered, menu walking reaches callsign and actions, panel scrolling remains,
no horizontal overflow, and outgoing results opacity is0at60/200ms. Primary viewed
the patched960x540victory image.265/265tests and build passed in the full worktree
per Opus's receipt.

Five curated images and exact raw capture/lease records are retained in
assets-source/launch-marketing/results-evidence/, with SHA256SUMS and RECEIPT.json.
The complete external base/stage/patch/captures are retained at
/home/knotzuni/code/KnotzAxxon/asset-work/public-launch/opus-high-marketing/results-fix/.
Regeneration plan: scripts/brand/launch/results-plan.cjs.

Limits: results were staged through actual Game._finish; no normal gameplay
episode, physical phone/controller, audio perception or FPS claim. On short screens
the original total row and callsign may require scrolling; the total also appears
in the heading summary. No final freeze/judging/publication implied.
