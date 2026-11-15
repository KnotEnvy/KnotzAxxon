# Environment kit devlog images

`blender-mcp/` — native Blender 5.2.1 viewport (software GL) through the Blender MCP bridge, looking at
actual streamed chunk geometry in the world-scale composition scenes (`../scenes/`). Proxy materials, solid
shading with vertex colours. Not game renders.

`game-software-webgl/` — the running game (dev build of the fixture), seed 7, real materials, fog, bloom and
shadows, rendered by headless Chromium with SwiftShader. `--source` is `?environmentKit=0`, `--kit` is the
default. Same seed, pose and frame count per pair. **Software frames: no hardware GPU, no frame-rate claim.**
The Outer Fortress / Gun Batteries `--kit` frames are from the final-kit re-capture.

Full capture reports (draw calls, triangles, renderer string, errors) are in `../evidence/captures/`.
