#!/usr/bin/env bash
# Builds the Rust core and the macOS test host, then runs test262 for the implemented constructors
# (or the given test paths). Needs vendor/hermes and vendor/test262 (.github/CONTRIBUTING.md).
set -euo pipefail
cd "$(dirname "$0")/.."

# Default: what ships (ICU4X compiled data, rust/locales/recommended.txt). Set HERMES_INTL_LOCALES
# to test a custom locale set; its data is generated with icu4x-datagen.
# rustup's toolchain, not whichever rustc comes first on PATH (e.g. Homebrew's).
BIN=${CARGO_HOME:-$HOME/.cargo}/bin
RUSTC=$("$BIN/rustup" which rustc) RUSTDOC=$("$BIN/rustup" which rustdoc)
export RUSTC RUSTDOC
CARGO=$("$BIN/rustup" which cargo)
if [ -n "${HERMES_INTL_LOCALES:-}" ]; then
  export ICU4X_DATA_DIR=$PWD/rust/target/data-test
  "$BIN/icu4x-datagen" --markers all --locales $HERMES_INTL_LOCALES --format baked --out "$ICU4X_DATA_DIR" --overwrite >/dev/null 2>&1
else
  unset ICU4X_DATA_DIR
fi
(cd rust && $CARGO build -q --release)
cmake -S host -B host/build -DCMAKE_BUILD_TYPE=Release >/dev/null
cmake --build host/build -j10 >/dev/null
DIRS=(test/intl402/PluralRules test/intl402/RelativeTimeFormat test/intl402/ListFormat test/intl402/Locale test/intl402/Intl/getCanonicalLocales)
node host/test262.mjs host/build/hi-host vendor/test262 "${@:-${DIRS[@]}}"
