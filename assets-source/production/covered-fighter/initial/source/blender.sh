#!/usr/bin/env bash
set -euo pipefail
home="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cache="/home/knotzuni/code/KnotzAxxon-archive/2026-11-14/contest-entry/.cache"
export LD_LIBRARY_PATH="$cache/sysroot/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export LIBGL_DRIVERS_PATH="$cache/sysroot/usr/lib/x86_64-linux-gnu/dri"
export LIBGL_ALWAYS_SOFTWARE=1
export LP_NUM_THREADS=8
export EGL_PLATFORM=surfaceless
export __EGL_VENDOR_LIBRARY_FILENAMES="$cache/sysroot/usr/share/glvnd/egl_vendor.d/50_mesa.json"
export XDG_CACHE_HOME="$home/.runtime/xdg"
export BLENDER_USER_CONFIG="$home/.runtime/blender-config"
export BLENDER_USER_SCRIPTS="$home/.runtime/blender-scripts"
export BLENDER_USER_DATAFILES="$home/.runtime/blender-datafiles"
export PYTHONPYCACHEPREFIX="$home/.runtime/pycache"
exec "$cache/blender-5.2.1-linux-x64/blender" "$@"
