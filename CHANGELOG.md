# Changelog

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
