# Changelog

## [0.1.2](https://github.com/magrinj/hermes-intl/compare/v0.1.1...v0.1.2) (2026-10-06)


### Bug Fixes

* pass Locale lists by tag and keep subclass prototypes in the wrappers ([f16ae7b](https://github.com/magrinj/hermes-intl/commit/f16ae7b6734b4ba6fd6d389881e66e2f4b233b81))
* pass locale lists to Hermes untouched ([bf11910](https://github.com/magrinj/hermes-intl/commit/bf119104db2e2a1faf01cebf0a9063be59af9fce))
* read an engine's own Intl.Locale objects as one locale ([e1877c8](https://github.com/magrinj/hermes-intl/commit/e1877c814788d4386a9eced62609171b1d3cc58f))

## [0.1.1](https://github.com/magrinj/hermes-intl/compare/v0.1.0...v0.1.1) (2026-10-01)


### Bug Fixes

* accept Intl.Locale objects in Hermes's own Intl functions ([779da61](https://github.com/magrinj/hermes-intl/commit/779da61fb0ada72779a997788dbb4a8d0fcc2c31))
* load the entry point in Jest without a transform ([22ec94e](https://github.com/magrinj/hermes-intl/commit/22ec94ee243649e0f7f67d873868a2fccae2cc11))
* select plurals on the whole value in scientific and engineering notation ([ae4401a](https://github.com/magrinj/hermes-intl/commit/ae4401a8fdc774a1cf5634b9817c25fdac5c51fe))

## 0.1.0 (2026-10-01)

- `Intl.PluralRules`, `Intl.RelativeTimeFormat`, `Intl.ListFormat` and `Intl.Locale` (with the
  Locale Info methods) on Hermes, installed only when Hermes lacks them.
- `Intl.getCanonicalLocales` replaced by a spec version that accepts `Intl.Locale` objects.
- Backed by ICU4X 2.3 with its 514 recommended locales, prebuilt for Android (arm64-v8a,
  armeabi-v7a, x86_64, x86) and iOS (device, simulator arm64 + x86_64).
- test262: 838 of 842 runs pass; the 2 known failing tests are listed in
  `host/test262-expected-failures.txt`.
- Tested on React Native 0.87.1 and Expo SDK 57 (React Native 0.86.3), on the iOS simulator,
  the Android emulator and a Pixel 8a.
