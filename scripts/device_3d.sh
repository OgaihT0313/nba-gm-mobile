#!/usr/bin/env bash
# On-device check for the 3D ("Assistir ao Jogo"), per PLANO-3D.md. Needs the
# phone on USB with debugging allowed. Run from the project root (Git Bash):
#
#   scripts/device_3d.sh install <apk>   install over the current app (keeps the save)
#   scripts/device_3d.sh start           open the app
#   scripts/device_3d.sh measure [n] [s] reset frame stats, take n prints s seconds
#                                        apart, then dump frame stats + 3D warnings
#
# Open "Assistir ao Jogo" on the phone (or by adb taps) before `measure`.
# Output goes to .device-3d/<timestamp>/ (git-ignored).
set -euo pipefail

ADB="${ADB:-/c/Users/Usuario/platform-tools/adb.exe}"
PKG="com.thiagonx.nbagm"

case "${1:-}" in
  install)
    "$ADB" install -r "${2:?caminho do apk}"
    ;;
  start)
    "$ADB" shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null
    ;;
  measure)
    n="${2:-8}"; gap="${3:-1}"
    out=".device-3d/$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$out"
    "$ADB" shell dumpsys gfxinfo "$PKG" reset >/dev/null
    "$ADB" logcat -c
    for i in $(seq -w 1 "$n"); do
      "$ADB" exec-out screencap -p > "$out/frame-$i.png"
      sleep "$gap"
    done
    # Janky frames / percentiles for the app's UI thread (the GL view renders
    # on its own thread, so this is the HUD; the prints show the 3D itself).
    "$ADB" shell dumpsys gfxinfo "$PKG" > "$out/gfxinfo.txt"
    grep -E "Total frames|Janky frames|50th|90th|95th|99th" "$out/gfxinfo.txt" || true
    # The two warnings PLANO-3D Etapa 0 cleans up, plus any JS error.
    "$ADB" logcat -d -s ReactNativeJS:V > "$out/logcat.txt" || true
    grep -iE "multiple instances|THREE\.|error" "$out/logcat.txt" || echo "sem avisos do three nem erros de JS"
    echo "prints e logs em $out"
    ;;
  *)
    sed -n '2,12p' "$0"
    exit 1
    ;;
esac
