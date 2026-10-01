#!/usr/bin/env bash
# Builds dist/ios/IntlDemo-{hermes-intl,formatjs}.app for the simulator (Release), installable side by side.
# Install with: xcrun simctl install booted dist/ios/<app>
set -euo pipefail
cd "$(dirname "$0")/../ios"
build() { # name, bundle id, entry file
  xcodebuild -workspace IntlDemo.xcworkspace -scheme IntlDemo -configuration Release -sdk iphonesimulator \
    -derivedDataPath "build-$1" PRODUCT_BUNDLE_IDENTIFIER="$2" ENTRY_FILE="$3" -quiet
  mkdir -p ../dist/ios
  rm -rf "../dist/ios/IntlDemo-$1.app"
  cp -R "build-$1/Build/Products/Release-iphonesimulator/IntlDemo.app" "../dist/ios/IntlDemo-$1.app"
}
build hermes-intl com.intldemo index.js
build formatjs com.intldemo.formatjs index.formatjs.js
ls -d ../dist/ios/*.app
