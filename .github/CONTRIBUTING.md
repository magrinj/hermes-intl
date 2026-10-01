# Contributing to hermes-intl

## Prerequisites

- [Bun](https://bun.sh/) (package manager)
- [rustup](https://rustup.rs/) with the Android and iOS targets:
  ```sh
  rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android \
    aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios
  ```
- [Xcode](https://developer.apple.com/xcode/) and [Android Studio](https://developer.android.com/studio),
  with the Android NDK 27.1.12297006
- CMake and Node 22, for the macOS test host

## Repository layout

[ARCHITECTURE.md](../ARCHITECTURE.md) explains how these pieces fit together.

| Path | What |
| --- | --- |
| `rust/` | Core on ICU4X: locale canonicalization, lookup and info; ECMA-402 rounding; plural, relative-time and list formatting. C ABI in `src/lib.rs`. |
| `cpp/` | JSI binding (host functions over the C ABI) and the TurboModule. |
| `js/bootstrap.js` | The spec shell: builds the `Intl` constructors on the host functions. |
| `src/` | Package entry point: installs the host functions, runs the shell. |
| `android/`, `ios/`, `HermesIntl.podspec`, `react-native.config.js` | Autolinking glue. |
| `prebuilt/` | Native binaries, built by `scripts/build-prebuilt.sh`. Not in git: CI builds them and the release ships them in the npm package. |
| `host/` | macOS test host: Hermes + the package, runs test262, the corpus and benchmarks. |
| `bench/` | Benchmark suite, correctness corpus, FormatJS baseline, [results](../bench/README.md). |
| `example/` | Demo and benchmark app (React Native 0.87), built with hermes-intl or FormatJS. |

## Setup

```sh
bun install
bun run prebuilt              # native binaries into prebuilt/ (about a minute)
cd example && bun install
cd ios && bundle install && bundle exec pod install
```

The example app links the package from the repository root (`example/react-native.config.js`
and `example/metro.config.js`), so JS edits in `src/` and `js/` show up on reload.

## Development workflow

1. Change `rust/`, `cpp/`, `js/` or `src/`.
2. After editing `rust/`: `bun run prebuilt`, then rebuild the example app.
3. Test in the example app: `cd example && bun run ios` (or `bun run android`). The **Bench**
   button runs the benchmark suite and the correctness corpus on the device; the corpus hash must
   match `bench/corpus.hash` (it is also logged as `HERMES_INTL_BENCH`).
4. Run the checks below.

## Checks

```sh
bun run test                  # Rust unit tests and the JS unit tests (node --test)
cd rust && cargo fmt --check && cargo clippy --lib --tests -- -D warnings
cd example && bun run lint
```

Conformance and correctness run on a macOS test host with Hermes built from source (one-time
setup, about 15 minutes):

```sh
git clone --depth 1 --branch hermes-v250829098.0.17 https://github.com/facebook/hermes vendor/hermes
cmake -S vendor/hermes -B vendor/hermes-build -DCMAKE_BUILD_TYPE=Release -DHERMES_ENABLE_INTL=ON -DCMAKE_POLICY_VERSION_MINIMUM=3.5
cmake --build vendor/hermes-build --target hermesvm -j
git init -q vendor/test262 && cd vendor/test262
git remote add origin https://github.com/tc39/test262
git sparse-checkout set harness test/intl402/PluralRules test/intl402/RelativeTimeFormat \
  test/intl402/ListFormat test/intl402/Locale test/intl402/Intl/getCanonicalLocales
git fetch -q --depth 1 --filter=blob:none origin 7ab7fafa0003f73fc85c1b95d88094d33f7eb8bd && git checkout -q FETCH_HEAD
cd ../..

bun run test262               # test262 for the implemented constructors
scripts/corpus.sh             # correctness corpus; hash must match bench/corpus.hash
```

A test that fails for a known reason goes in `host/test262-expected-failures.txt`, with why.
After an intended output change, update `bench/corpus.hash` and say why in the PR.

CI runs all of the above, builds the prebuilt binaries, the npm package, and the example app for
Android and iOS.

## Custom locale set

The default build ships ICU4X's 514 recommended locales. For a smaller binary (about 0.6 MB per
ABI for 5 locales), generate the data and rebuild:

```sh
cargo install icu4x-datagen --version 2.3 --features unstable
export HERMES_INTL_LOCALES="en fr de pl ar"
export ICU4X_DATA_DIR=$PWD/rust/target/data
icu4x-datagen --markers all --locales $HERMES_INTL_LOCALES --format baked --out $ICU4X_DATA_DIR --overwrite
bun run prebuilt
```

## Other scripts

- `scripts/notices.sh`: regenerates `THIRD_PARTY_NOTICES.md` after changing Rust dependencies.
- `bench/charts.mjs`: regenerates the README charts after updating the numbers it holds.
- `example/scripts/build-android.sh`, `build-ios-sim.sh`: the two demo builds side by side (see
  [example/README.md](../example/README.md)).

## Releasing

**First release (0.1.0), once, locally.** npm trusted publishing only works for a package that
already exists, so the first version is published by hand:

```sh
bun run prebuilt && npm publish --access public   # prepack refuses to pack without prebuilt/
git tag v0.1.0 && git push origin v0.1.0          # then create the GitHub release from the tag
```

Then, on npmjs.com → hermes-intl → Settings → Trusted publishing, add the GitHub repository
`magrinj/hermes-intl` and the workflow `release.yml`.

**Every release after that:** run the **Release** workflow (Actions → Release → patch, minor or
major). It runs CI, then `release-it`: bumps the version, rebuilds `prebuilt/` with it, updates
`CHANGELOG.md` from the commit messages ([Conventional Commits](https://www.conventionalcommits.org/)),
tags, publishes to npm with provenance, and creates the GitHub release.

## Pull request guidelines

- Keep PRs focused on a single change.
- Include a clear description of what and why.
- Use Conventional Commit messages (`feat:`, `fix:`, `perf:`, `docs:`, `chore:`…).
- Make sure the checks above pass.
