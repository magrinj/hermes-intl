# Benchmarks

hermes-intl against the FormatJS polyfills an app ships today, on the same Hermes, in the same
app. React Native 0.87.1, New Architecture, Hermes 250829098.0.17, release builds (Hermes
bytecode), locales en fr de pl ar.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../.github/assets/chart-interactions-dark.svg">
  <img alt="Real-world interactions on a Pixel 8a" src="../.github/assets/chart-interactions-light.svg" width="100%">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../.github/assets/chart-speedup-dark.svg">
  <img alt="Per-call speedup over FormatJS on a Pixel 8a" src="../.github/assets/chart-speedup-light.svg" width="100%">
</picture>

## Pixel 8a

Android 16, 60 Hz, 2026-09-30. The [example app](../example/) built twice (hermes-intl and
FormatJS), runs alternated. Battery held at 80 % (not charging), phone cooled down first:
thermal status 0 for the interactions, 1 (light) for memory, cold start and per-call runs.

### Real-world interactions

Median of 3 runs, each timed from the tap or keystroke to the last row rendered.

| | hermes-intl | FormatJS | |
| --- | --- | --- | --- |
| Open a 20-row notification screen, first time | 37 ms | 79 ms | 2.1× |
| Open a 20-row notification screen, again | 42 ms | 79 ms | 1.9× |
| Switch language EN → FR, visible feed | 32 ms | 64 ms | 2.0× |
| Switch language FR → PL, visible feed | 34 ms | 63 ms | 1.9× |
| Search, worst keystroke | 42 ms | 63 ms | 1.5× |
| Fast scroll 5 s, worst frame | 37 ms | 77 ms | 2.1× |
| Startup to first screen | 77 ms | 105 ms | 1.4× |
| 10,000 notifications, `Intl` calls only | 87 ms | 9,340 ms | 107× |
| 10,000 notifications, i18next + `Intl` | 1,320 ms | 16,258 ms | 12× |

A frame is 16.7 ms: each FormatJS interaction drops 1 to 3 more frames. The scroll frame rate is
not shown: Android paced both builds at 30 or 60 FPS from one run to the next, even at rest.

### Per call

Median of 3 runs of [suite.js](suite.js) on the device (the example app's **Bench** button).

| Call | hermes-intl | FormatJS | |
| --- | --- | --- | --- |
| PluralRules `select` (integer) | 1.3 µs | 672 µs | 506× |
| PluralRules `select` (decimal) | 1.1 µs | 911 µs | 821× |
| PluralRules `selectRange` | 2.0 µs | 1,102 µs | 556× |
| PluralRules first `new` | 364 µs | 2,572 µs | 7× |
| RelativeTimeFormat `format` | 1.6 µs | 744 µs | 456× |
| RelativeTimeFormat `formatToParts` | 6.1 µs | 823 µs | 134× |
| RelativeTimeFormat first `new` | 41 µs | 6,516 µs | 159× |
| ListFormat `format` (3 items) | 1.3 µs | 17 µs | 13× |
| ListFormat `formatToParts` (3 items) | 8.0 µs | 18 µs | 2.3× |
| Locale first `new` | 140 µs | 28,621 µs | 205× |
| Locale `new` | 29 µs | 478 µs | 16× |
| Locale `maximize()` | 4.5 µs | 207 µs | 46× |

`ListFormat` gains the least: joining three strings is cheap in JS, and our cost is the JSI
crossing plus decoding the packed parts.

### Startup, memory, size

| | hermes-intl | FormatJS |
| --- | --- | --- |
| `Intl` setup at startup (median of 3) | 1.4 ms | 20 ms |
| Cold start to first frame, `am start -W` (median of 10) | 161 ms | 156 ms |
| Memory (PSS) at rest, median of 3 | 128.1 MB | 131.2 MB |
| Memory (PSS) after using 4 languages, median of 3 | 131.5 MB | 136.4 MB |
| JS bundle (Hermes bytecode) | 1,255 KB | 1,655 KB |
| Native library (arm64-v8a) | +1.65 MB | |

Android reports the same cold start for both: its first frame comes before the JS screen. The
FormatJS build also contains hermes-intl's native library (autolinking adds it to both builds),
loaded but unused, so a real FormatJS app uses slightly less memory than shown.

### Flashlight

[Flashlight](https://github.com/bamlab/flashlight) measures the app from the outside (CPU per
thread, UI frame rate, RAM) and gives a score out of 100. 5 iterations per scenario and build,
averaged ([flashlight.js](flashlight.js)).

| Scenario | | Score | JS thread CPU | Total CPU | Time with the JS thread above 90 % | RAM |
| --- | --- | --- | --- | --- | --- | --- |
| Fast scroll, 5 s | hermes-intl | **94** | 46 % | 87 % | 0 s | 223 MB |
| | FormatJS | 62 | 52 % | 84 % | 3.6 s | 227 MB |
| Startup | hermes-intl | 99 | 8 % | 31 % | 0 s | 197 MB |
| | FormatJS | 100 | 12 % | 44 % | 0 s | 203 MB |
| Open a screen, 4 languages, search | hermes-intl | 100 | 12 % | 38 % | 0 s | 204 MB |
| | FormatJS | 100 | 16 % | 42 % | 0 s | 210 MB |

During a fast scroll, FormatJS keeps the JS thread saturated for 3.6 of the 5 seconds, which is
what drops its score. The UI thread holds 60 FPS in every run: the cost lands on the JS thread.

### Correctness

The corpus ([corpus.js](corpus.js), 2,656 cases) gives `713fb2ce` with hermes-intl, the same hash
as iOS and the macOS test host (`corpus.hash`, checked in CI). FormatJS gives `527cd73b` on
Android and `a1690ca5` on iOS: its output depends on the platform.

## Reproduce

- Per call and corpus: the **Bench** button in the example app, or on the macOS host
  `host/build/hi-host bench/suite.js bench/bench.js` (see [CONTRIBUTING.md](../.github/CONTRIBUTING.md)).
- Interactions: the example app's buttons (open screen, EN/FR/PL, ▶ search, auto-scroll, stress).
- Cold start: `adb shell am start -W -n com.intldemo/.MainActivity` after `am force-stop`.
- Memory: `adb shell dumpsys meminfo com.intldemo`, TOTAL PSS.
- Flashlight: `cd bench && bun install`, then `node flashlight.js <startup|scroll|usage> <bundle id>`
  for each build, and `node flashlight-summary.js`.
- Charts: update the numbers in [charts.mjs](charts.mjs) and run `node bench/charts.mjs`.

## Simulators and emulator

These run on an Apple Silicon Mac: absolute numbers are faster than a phone, the ratios are the
point. On a Mac, scrolling holds 60 FPS in both builds; the difference shows on a phone.

### iOS simulator (iPhone 16 / 16 Plus, iOS 18.5)

| | hermes-intl | FormatJS |
| --- | --- | --- |
| `Intl` setup at startup | 0.15 to 1.4 ms | 10 ms |
| Open a 20-row screen (first / again) | 19 / 9.6 ms | 31 / 27 ms |
| Switch language (EN → FR / FR → PL) | 7.9 / 7.9 ms | 34 / 26 ms |
| Search, worst keystroke | 11 ms | 34 ms |
| 10,000 notifications, `Intl` calls only | 46 ms | 4,760 ms |
| 10,000 notifications, i18next + `Intl` | 503 ms | 7,912 ms |
| PluralRules `select` | 0.52 µs | 211 µs |
| PluralRules `selectRange` | 0.89 µs | 416 µs |
| RelativeTimeFormat `format` | 1.3 to 1.4 µs | 209 µs |
| RelativeTimeFormat `formatToParts` | 3.2 to 3.4 µs | 208 µs |
| ListFormat `format` (3 items) | 1.8 µs | 4.9 µs |
| Locale first `new` | 52 to 89 µs | 7,280 µs |
| Locale `maximize()` | 7.6 to 8.2 µs | 22 µs |
| JS bundle (`main.jsbundle`) | 1,307 KB | 1,735 KB |

### Android emulator (arm64, API 36)

| | hermes-intl | FormatJS |
| --- | --- | --- |
| `Intl` setup at startup | 0.18 to 7 ms | 17 to 92 ms |
| 10,000 notifications, `Intl` calls only | 65 ms | 6,660 ms |
| 10,000 notifications, i18next + `Intl` | 577 ms | 9,899 ms |
| PluralRules `select` | 0.8 to 1.2 µs | 244 to 252 µs |
| RelativeTimeFormat `format` | 1.9 to 2.8 µs | 257 to 281 µs |
| ListFormat `formatToParts` | 6.4 to 6.8 µs | 4.4 to 4.6 µs |
| Locale first `new` | 67 to 110 µs | 6,450 to 6,970 µs |
| Locale `maximize()` | 8.0 to 9.4 µs | 49 to 60 µs |

## Conformance: test262

Shipped configuration (514 locales), Hermes 250829098.0.17 with its Apple `Intl`, test262 pinned
at `7ab7fafa` (`scripts/test262.sh`, run in CI). Each test runs in sloppy and strict mode:

| Suite | Pass | Expected failures | Skipped |
| --- | --- | --- | --- |
| `intl402/PluralRules` | 102 | 2 | 1 |
| `intl402/RelativeTimeFormat` | 156 | 2 | 1 |
| `intl402/ListFormat` | 160 | 0 | 1 |
| `intl402/Locale` (incl. Locale Info) | 344 | 0 | 1 |
| `intl402/Intl/getCanonicalLocales` | 76 | 0 | 0 |
| **Total** | **838** runs | **4** runs | **4** files |

- Skipped: `proto-from-ctor-realm.js` in each folder needs `$262.createRealm`.
- Expected failures (`host/test262-expected-failures.txt`), each in both modes:
  - `RelativeTimeFormat/prototype/format/en-us-numbering-systems.js` compares our output with
    Hermes's own `Intl.NumberFormat("en-US-u-nu-arab")`, which ignores `-u-nu-` on Apple platforms.
    Our output matches V8.
  - `PluralRules/prototype/resolvedOptions/plural-categories-order.js` checks "gv" (Manx), which is
    not in the recommended locale set.

## Correctness against V8

Node 22 (ICU 77, CLDR 47) on the same corpus:

- ListFormat: identical on all 225 cases.
- RelativeTimeFormat: identical except 4 French year phrases where CLDR changed ("l’an dernier"
  vs "l’année dernière"), and `numeric: "auto"` with 0.9999: V8 rounds first and says
  "tomorrow", the spec keys on `ToString(value)` and we say "in 1 day".
- Locale: identical except `new Intl.Locale("und-150").language`, undefined in V8 and "und" in
  the spec.
- FormatJS selects plurals of decimals on the integer part ([formatjs-plurals.js](formatjs-plurals.js)):

  | | V8 and hermes-intl | FormatJS |
  | --- | --- | --- |
  | `new Intl.PluralRules('ar').select(1.5)` | other | one |
  | `new Intl.PluralRules('ar').select(2.5)` | other | two |
  | `new Intl.PluralRules('en', { type: 'ordinal' }).select(1.5)` | other | one |

  So "in 1.5 seconds" in Arabic reads "in one second".

## Package

| | |
| --- | --- |
| npm tarball | 3.0 MB packed, 9.4 MB unpacked, 32 files |
| Locales | ICU4X recommended set, 514 ([list](../rust/locales/recommended.txt)) |
| Native size | Android 1.65 MB arm64-v8a, 1.02 MB armeabi-v7a, 1.71 MB x86_64, 1.21 MB x86; iOS 1.24 MB device |
| Native size, 5 locales | Android 0.60 MB arm64-v8a, 0.45 MB armeabi-v7a; iOS 0.55 MB |
| JS shell | 39 KB source, 37 KB bytecode |
| Tested | React Native 0.87.1 and Expo SDK 57 (React Native 0.86.3, `expo prebuild`), Android and iOS release builds, debug with Metro reloads |

## Also found

- Hermes's `NumberFormat` ignores `-u-nu-` on Apple platforms and has no `formatToParts` on iOS.
- FormatJS's current polyfills need `@babel/plugin-transform-class-static-block` to build with
  React Native's Babel preset.
- ICU4X gaps filled in the package: no RelativeTimeFormat C binding, number parts flattened in
  relative-time output, 5 to 8 letter language subtags, `-u-` value aliases, "und" in likely
  subtags, root symbols for an explicit `-u-nu-arab`, only the default calendar per region, no
  hour-cycle data.

## Not measured yet

A low-end Android phone (a Redmi, for example).
