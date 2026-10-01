#!/usr/bin/env bash
# Refuses to pack without the native binaries (built by scripts/build-prebuilt.sh, or in CI).
set -euo pipefail
cd "$(dirname "$0")/.."
for f in prebuilt/android/{arm64-v8a,armeabi-v7a,x86_64,x86}/libhermes_intl.so \
  prebuilt/ios/HermesIntlCore.xcframework/Info.plist \
  prebuilt/ios/HermesIntlCore.xcframework/{ios-arm64,ios-arm64_x86_64-simulator}/HermesIntlCore.framework/HermesIntlCore; do
  [ -f "$f" ] || { echo "missing $f: run scripts/build-prebuilt.sh" >&2; exit 1; }
done
node scripts/check-elf-alignment.mjs prebuilt/android/*/libhermes_intl.so
