#!/usr/bin/env bash
set -euo pipefail

drone_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
runtime_cache="/home/knotzuni/code/KnotzAxxon-archive/2026-11-14/contest-entry/.cache"
sysroot_lib="$runtime_cache/sysroot/usr/lib/x86_64-linux-gnu"
blender_bin="$runtime_cache/blender-5.2.1-linux-x64/blender"

if [[ "$(uname -s)" != Linux || ! -x "$blender_bin" || ! -d "$sysroot_lib" ]]; then
  printf 'Native Linux Blender or its existing runtime libraries are unavailable.\n' >&2
  exit 1
fi

export LD_LIBRARY_PATH="$sysroot_lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export LIBGL_DRIVERS_PATH="$sysroot_lib/dri"
export LIBGL_ALWAYS_SOFTWARE=1
export LP_NUM_THREADS=4
export EGL_PLATFORM=surfaceless
export __EGL_VENDOR_LIBRARY_FILENAMES="$runtime_cache/sysroot/usr/share/glvnd/egl_vendor.d/50_mesa.json"
export XDG_CACHE_HOME="$drone_root/.runtime/xdg"
export BLENDER_USER_CONFIG="$drone_root/.runtime/blender-config"
export BLENDER_USER_SCRIPTS="$drone_root/.runtime/blender-scripts"
export BLENDER_USER_DATAFILES="$drone_root/.runtime/blender-datafiles"
exec "$blender_bin" "$@"
