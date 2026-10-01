# hermes-intl example: demo and benchmark

The same React Native app built twice, installable side by side:

| Build | App name / bundle id | Colour | Intl |
| --- | --- | --- | --- |
| hermes-intl (`index.js`) | Intl · hermes-intl / `com.intldemo` | green | `import 'hermes-intl'` |
| FormatJS (`index.formatjs.js`) | Intl · FormatJS / `com.intldemo.formatjs` | orange | FormatJS polyfills (what apps ship today) |

Everything else is identical: a feed of 2,000 notifications formatted with i18next and
`Intl.RelativeTimeFormat` / `PluralRules` / `ListFormat` ("Chloé, Zofia and 35 others started
following you · 107 likes · 13 seconds ago"), in en / fr / pl / ar.

## Run it

From the repository root, once: `bun install && bun run prebuilt` (see
[CONTRIBUTING.md](../.github/CONTRIBUTING.md)). Then:

```sh
cd example
bun install
cd ios && bundle install && bundle exec pod install && cd ..
bun run ios        # or: bun run android (the hermes-intl build, in debug)
```

The two release builds, side by side:

```sh
bun run build:android   # dist/intl-demo-hermes-intl.apk, dist/intl-demo-formatjs.apk
bun run build:ios       # dist/ios/IntlDemo-{hermes-intl,formatjs}.app (simulator)
adb install -r dist/intl-demo-hermes-intl.apk && adb install -r dist/intl-demo-formatjs.apk
xcrun simctl install booted dist/ios/IntlDemo-hermes-intl.app
```

The APKs are release builds signed with the debug key; you can also copy them to a phone and open
them (allow installs from unknown sources).

## What is on screen

- **The white bar** is moved by JavaScript every frame. When the JS thread is blocked, it stops.
- **FPS / longest frame**: JS-thread frame rate over the last second, worst frame over 3 s.
- **Intl setup**: time to load hermes-intl or the polyfills. **startup → screen**: from the first
  line of the bundle to the first screen.

Real use, each timed from the tap or keystroke to the last row rendered:

- **Open screen · 20 rows**: a notifications screen opening (tap again for the next 20, ✕ closes).
- **switch → xx** (EN/FR/PL/AR): the whole visible feed re-rendered in another language.
- **Search**: type a name, or ▶ to type "clara" at a steady pace. The worst keystroke is the first
  one, where every visible row changes.
- **Auto-scroll 5 s**: scripted fast fling (15 px/ms, ~4 new rows per frame), average FPS and worst
  frame.
- **Live**: timestamps refresh every second. **Legend / Flat**: LegendList (default) or FlatList.

Stress tests: **Intl only × 10,000** and **i18next + Intl × 10,000**. No app does this at once;
they magnify the per-call cost so it is visible to the eye.

**Bench** runs the shared micro-benchmarks and the correctness corpus
([bench/](../bench/)) on the device and logs them as `HERMES_INTL_BENCH`. With hermes-intl, the
corpus hash is the same on iOS, Android and the test host (`bench/corpus.hash`).

## Results

See [bench/README.md](../bench/README.md): the Pixel 8a runs of this app, Flashlight scores, and
the simulator and emulator runs.
