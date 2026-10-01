#!/usr/bin/env bash
# Checks the corpus hash on the macOS test host against bench/corpus.hash, shared by iOS, Android and the host.
# Run scripts/test262.sh first (it builds hi-host). After an intended output change, update bench/corpus.hash.
set -euo pipefail
cd "$(dirname "$0")/.."
expected=$(cat bench/corpus.hash)
got=$(host/build/hi-host bench/corpus.js bench/corpus-print.js | sed -n 's/^hash //p')
if [ "$got" != "$expected" ]; then
  echo "corpus hash $got, expected $expected (bench/corpus.hash)" >&2
  exit 1
fi
echo "corpus hash $got"
