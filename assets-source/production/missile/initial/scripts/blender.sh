#!/usr/bin/env bash
set -euo pipefail
cache="${MISSILE_BLENDER_CACHE:-/home/knotzuni/code/KnotzAxxon-archive/2026-11-14/contest-entry/.cache}"
runtime="${MISSILE_RUNTIME:-$(cd "$(dirname "$0")/../.." && pwd)/.runtime}"
export LD_LIBRARY_PATH="$cache/sysroot/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export LIBGL_DRIVERS_PATH="$cache/sysroot/usr/lib/x86_64-linux-gnu/dri"
export LIBGL_ALWAYS_SOFTWARE=1 LP_NUM_THREADS=4 EGL_PLATFORM=surfaceless
export __EGL_VENDOR_LIBRARY_FILENAMES="$cache/sysroot/usr/share/glvnd/egl_vendor.d/50_mesa.json"
export XDG_CACHE_HOME="$runtime/xdg" BLENDER_USER_CONFIG="$runtime/config"
export BLENDER_USER_SCRIPTS="$runtime/scripts" BLENDER_USER_DATAFILES="$runtime/data"
exec "$cache/blender-5.2.1-linux-x64/blender" "$@"
