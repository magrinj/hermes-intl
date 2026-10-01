#!/usr/bin/env bash
# Builds prebuilt/ (the npm package binaries) with ICU4X's recommended locales (514).
# Fewer locales: set HERMES_INTL_LOCALES and ICU4X_DATA_DIR (.github/CONTRIBUTING.md#custom-locale-set).
set -euo pipefail
cd "$(dirname "$0")/.."

# rustup's toolchain, not whichever rustc comes first on PATH (e.g. Homebrew's).
BIN=${CARGO_HOME:-$HOME/.cargo}/bin
RUSTC=$("$BIN/rustup" which rustc)
export RUSTC
CARGO=$("$BIN/rustup" which cargo)
NDK=${ANDROID_NDK_HOME:-$HOME/Library/Android/sdk/ndk/27.1.12297006}
NDK_BIN=$NDK/toolchains/llvm/prebuilt/darwin-x86_64/bin
OUT=$PWD/prebuilt
TARGET_DIR=$PWD/rust/target/prebuilt

build() { # rust-target, extra rustc link args…
  local t=$1; shift
  (cd rust && $CARGO rustc -q --release --target "$t" --target-dir "$TARGET_DIR" --crate-type cdylib -- "$@")
}

# Android: shared library per ABI. The soname keeps DT_NEEDED free of build paths, and 16 KB
# segment alignment is required by Google Play for apps targeting Android 15+.
# Each entry: ABI, Rust target, NDK clang prefix (API 24).
for entry in arm64-v8a:aarch64-linux-android:aarch64-linux-android24 \
  armeabi-v7a:armv7-linux-androideabi:armv7a-linux-androideabi24 \
  x86_64:x86_64-linux-android:x86_64-linux-android24 \
  x86:i686-linux-android:i686-linux-android24; do
  IFS=: read -r abi t clang <<<"$entry"
  upper=$(echo "$t" | tr 'a-z-' 'A-Z_')
  export "CARGO_TARGET_${upper}_LINKER=$NDK_BIN/$clang-clang"
  build "$t" -C link-arg=-Wl,-soname,libhermes_intl.so -C link-arg=-Wl,-z,max-page-size=16384
  mkdir -p "$OUT/android/$abi"
  "$NDK_BIN/llvm-strip" --strip-all -o "$OUT/android/$abi/libhermes_intl.so" "$TARGET_DIR/$t/release/libhermes_intl.so"
done

# iOS: dynamic framework per platform, then an xcframework.
export IPHONEOS_DEPLOYMENT_TARGET=15.1
NAME=HermesIntlCore
VERSION=$(node -p "require('./package.json').version")
INSTALL=-Wl,-install_name,@rpath/$NAME.framework/$NAME
for t in aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios; do build "$t" -C "link-arg=$INSTALL"; done
FW=$TARGET_DIR/frameworks
framework() { # dir, platform, binaries…
  local dir=$1 platform=$2; shift 2
  mkdir -p "$dir/$NAME.framework"
  lipo -create "$@" -output "$dir/$NAME.framework/$NAME"
  strip -x "$dir/$NAME.framework/$NAME"
  # fstat comes from the Rust standard library; no file is opened or inspected by this library.
  cat > "$dir/$NAME.framework/PrivacyInfo.xcprivacy" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>NSPrivacyTracking</key><false/>
  <key>NSPrivacyTrackingDomains</key><array/>
  <key>NSPrivacyCollectedDataTypes</key><array/>
  <key>NSPrivacyAccessedAPITypes</key><array><dict>
    <key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
    <key>NSPrivacyAccessedAPITypeReasons</key><array><string>C617.1</string></array>
  </dict></array>
</dict></plist>
PLIST
  cat > "$dir/$NAME.framework/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleExecutable</key><string>$NAME</string>
  <key>CFBundleIdentifier</key><string>dev.hermes-intl.core</string>
  <key>CFBundleName</key><string>$NAME</string>
  <key>CFBundlePackageType</key><string>FMWK</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleSupportedPlatforms</key><array><string>$platform</string></array>
  <key>MinimumOSVersion</key><string>15.1</string>
</dict></plist>
PLIST
}
mkdir -p "$FW"
framework "$FW/ios" iPhoneOS "$TARGET_DIR/aarch64-apple-ios/release/libhermes_intl.dylib"
framework "$FW/sim" iPhoneSimulator "$TARGET_DIR/aarch64-apple-ios-sim/release/libhermes_intl.dylib" \
  "$TARGET_DIR/x86_64-apple-ios/release/libhermes_intl.dylib"
mkdir -p "$OUT/ios"
out=$OUT/ios/$NAME.xcframework
if [ -d "$out" ]; then rm -r "${out:?}"; fi
xcodebuild -create-xcframework -framework "$FW/ios/$NAME.framework" -framework "$FW/sim/$NAME.framework" -output "$out" >/dev/null

du -sh "$OUT"/android/* "$OUT"/ios/$NAME.xcframework
