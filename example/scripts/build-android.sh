#!/usr/bin/env bash
# Builds dist/intl-demo-{hermes-intl,formatjs}.apk: release, signed with the debug key, installable side by side.
set -euo pipefail
cd "$(dirname "$0")/../android"
ABIS=${ABIS:-arm64-v8a,armeabi-v7a}
mkdir -p ../dist
./gradlew assembleRelease -PreactNativeArchitectures=$ABIS --console=plain -q
cp app/build/outputs/apk/release/app-release.apk ../dist/intl-demo-hermes-intl.apk
./gradlew assembleRelease -PreactNativeArchitectures=$ABIS -Pformatjs --console=plain -q
cp app/build/outputs/apk/release/app-release.apk ../dist/intl-demo-formatjs.apk
ls -l ../dist
