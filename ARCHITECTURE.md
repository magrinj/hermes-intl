# Architecture

How hermes-intl is built, how it ends up inside a React Native app, and what happens when your
code calls `Intl.PluralRules`. For installation and numbers, see the [README](README.md) and
[bench/README.md](bench/README.md).

## The problem

Hermes ships `Intl.NumberFormat`, `Intl.DateTimeFormat` and `Intl.Collator`, backed by the
platform. It has no `Intl.PluralRules`, `Intl.RelativeTimeFormat`, `Intl.ListFormat` or
`Intl.Locale`. Apps fill the gap with JavaScript polyfills (FormatJS) that carry their locale
data as JS: bigger bundles, slow calls, and output that differs between iOS and Android because
the polyfills lean on Hermes's own `NumberFormat`.

hermes-intl implements those four constructors natively. It has no API of its own: you import it
once and the standard globals appear.

## Overview

```
app code, i18next, react-intl, Luxon
        |   new Intl.PluralRules('pl').select(3)
        v
globalThis.Intl
  NumberFormat, DateTimeFormat, Collator      Hermes, untouched
  PluralRules, RelativeTimeFormat,
  ListFormat, Locale                           added by hermes-intl
        |
        v
1. JS shell      js/bootstrap.js         the ECMA-402 rules
        |   host functions (prNew, prSelect, rtfFormat, ...)
        v
2. C++ binding   cpp/hermes_intl.cpp     JSI: JS values <-> C, owns the Rust objects
        |   C ABI (hi_pr_select, hi_rtf_format, ...)
        v
3. Rust core     rust/src/*.rs           algorithms and CLDR data (ICU4X)
```

**Rust core.** Wraps ICU4X: plural categories, relative-time and list patterns, locale
canonicalization and likely subtags, number formatting for the parts. The CLDR data is compiled
into the binary for the locales in [rust/locales/recommended.txt](rust/locales/recommended.txt);
`rust/build.rs` turns that list into the one used for lookup. The C ABI is in
[rust/src/lib.rs](rust/src/lib.rs), mirrored by [cpp/hermes_intl_core.h](cpp/hermes_intl_core.h).

**C++ binding.** Builds a plain JS object of host functions. Rust objects (plural rules,
relative-time and list formatters) reach JS as handle objects carrying a `NativeState`: when
Hermes collects the handle, its destructor frees the Rust object.

**JS shell.** Defines the constructors and does everything the spec makes observable: locale
negotiation, option reading order, argument coercion, error types, property attributes and brand
checks. Instance state lives in `WeakMap`s, so instances have no own properties, and the
intrinsics it needs are captured up front so that code patching built-ins later cannot change its
behavior. Observable behavior is easier to match exactly in JS (it is what test262 checks), and
the shell is compiled to Hermes bytecode with the app.

## Startup: how it gets injected

[src/index.js](src/index.js) is the package entry point:

```js
if (typeof g.HermesInternal === 'object' && g.HermesInternal !== null) {
  const { I18nManager, TurboModuleRegistry } = require('react-native');
  const native = TurboModuleRegistry.get('NativeHermesIntl');
  const { toBcp47 } = require('./hostLocale');
  require('../js/bootstrap')(native.install(toBcp47(I18nManager.getConstants().localeIdentifier)), g);
}
```

1. It runs when the bundle is evaluated, so `import 'hermes-intl'` belongs at the top of the app
   entry. On other engines (JSC, V8) it does nothing: they already have these constructors. It is
   plain CommonJS with every `require` inside the check, so Jest loads it without a transform.
2. `NativeHermesIntl` is a C++ TurboModule ([spec](src/NativeHermesIntl.ts),
   [class](cpp/NativeHermesIntl.h)). A TurboModule is how a library gets the `jsi::Runtime`
   without any code in the app. Android registers it through the cxxModule fields of
   [react-native.config.js](react-native.config.js) (and
   [android/CMakeLists.txt](android/CMakeLists.txt)), iOS through
   `codegenConfig.ios.modulesProvider` ([ios/HermesIntlProvider.mm](ios/HermesIntlProvider.mm)).
3. `install(hostLocale)` runs synchronously and returns the object of host functions.
4. The shell receives that object and defines `PluralRules`, `RelativeTimeFormat`, `ListFormat`
   and `Locale` on `Intl`, each only if `Intl[name]` is `undefined`: if Hermes ships one later,
   Hermes's own implementation wins. When it installs `Locale`, it also replaces
   `Intl.getCanonicalLocales` so that it accepts our `Intl.Locale` objects.

Reloads in development repeat the same sequence on the new runtime.

**Default locale.** Constructors called without a locale use the device's. On Android,
`I18nManager` reports Java's `Locale.toString()` format (`zh_CN_#Hans`) and
[src/hostLocale.js](src/hostLocale.js) converts it to BCP 47. React Native reports nothing on
iOS, so the C++ asks CoreFoundation for the first preferred language (the UI language, not the
region). When nothing matches the available locales, the default is `en`.

## One call, end to end

`new Intl.PluralRules('pl').select(3)`:

1. The shell canonicalizes the tag and resolves it against the available locales (`canonicalize`
   and `lookup`, implemented in Rust: BCP 47 truncation, `fr-CA` falls back to `fr`), reads the
   options, then calls `prNew`.
2. The C++ side calls `hi_pr_new`, which builds an ICU4X `PluralRules` with the rounding
   settings. The pointer goes into a handle object, which the shell keeps in a `WeakMap` slot.
3. `select(3)` checks the receiver, normalizes the number and calls `prSelect(handle, 3)`.
4. Rust turns the number into a decimal, applies the rounding options and asks ICU4X for the
   category. The shell maps the returned index to `'few'`.

Numbers cross the boundary as a JS number, or as a normalized decimal string when exactness
matters (strings, BigInt, large exponents). `formatToParts` results come back as one packed
string ([rust/src/parts.rs](rust/src/parts.rs)) that the shell unpacks into part objects, so one
`formatToParts` call is a single crossing.

## With i18n libraries

Libraries do not know about hermes-intl. They call or feature-detect the standard constructors:

- **i18next** builds an `Intl.PluralRules` per language to pick plural keys (`_one`, `_few`,
  ...). Without it, it falls back to a rule that only tells 1 from the rest.
- **FormatJS (react-intl)** uses `PluralRules` and `Locale` for ICU messages, and
  `RelativeTimeFormat` and `ListFormat` behind `formatRelativeTime` and `formatList`. Remove its
  polyfill imports: the `-force` variants would overwrite the native constructors.
- **Luxon** uses `Intl.RelativeTimeFormat` for non-English relative times when it exists, and
  falls back to an English-only formatter when it does not.

The [example app](example/) exercises i18next; the others use the same constructors.

## What it does not touch

`Intl.NumberFormat`, `Intl.DateTimeFormat` and `Intl.Collator` stay Hermes's own, and so do
`toLocaleString`, `localeCompare` and `Date`. Hermes reads a lone `Intl.Locale` object as an empty
list, so the shell wraps them to pass the object's tag instead; names, prototypes and everything
else stay Hermes's. There is no network access, no storage and no UI.
`Intl.DisplayNames` and `Intl.Segmenter` are not provided.

## Build and packaging

- `scripts/build-prebuilt.sh` compiles the Rust core into `libhermes_intl.so` (four ABIs, 16 KB
  aligned) and a dynamic `HermesIntlCore.xcframework` with a privacy manifest. They ship inside
  the npm package (`prebuilt/`, not in git), so consumers do not need Rust.
- The C++ is compiled in the consumer's app build (CMake, CocoaPods), because it needs the app's
  JSI headers and the codegen output.
- The shell is part of the app's JS bundle.

## Tests

Rust unit tests, JS unit tests (`test/`), the test262 subset on a macOS Hermes host
(`host/`, `scripts/test262.sh`), and a correctness corpus whose output hash must be identical on
the host, iOS and Android ([bench/corpus.js](bench/corpus.js), `bench/corpus.hash`). See
[CONTRIBUTING.md](.github/CONTRIBUTING.md).

## Trade-offs

- **ICU4X with compiled-in data instead of the OS's ICU.** The same data and algorithms on both
  platforms, small and modular, and no dependency on what the OS exposes.
- **Prebuilt binaries instead of building Rust in every app.** No toolchain for users, in
  exchange for CI that produces and checks the binaries.
- **Limits.** New Architecture and Hermes only, a fixed locale set (rebuild for a different
  one), one realm, and a CLDR version that follows ICU4X, which differs slightly from V8's (see
  [bench/README.md](bench/README.md)).
