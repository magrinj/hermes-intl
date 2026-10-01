// Installs the Intl constructors Hermes lacks (PluralRules, RelativeTimeFormat, ListFormat,
// Locale). Import it first in the app entry, before anything that uses Intl:
//   import 'hermes-intl';
// No-op on other engines (JSC, V8, web, Jest), which already ship these constructors.
// Plain CommonJS with every require inside the Hermes check, so Jest loads it without a transform.
const g = globalThis;

if (typeof g.HermesInternal === 'object' && g.HermesInternal !== null) {
  const { I18nManager, TurboModuleRegistry } = require('react-native');
  const native = TurboModuleRegistry.get('NativeHermesIntl');
  if (native == null) {
    console.warn('hermes-intl: native module not found. Rebuild the app after installing the package.');
  } else {
    const { toBcp47 } = require('./hostLocale');
    require('../js/bootstrap')(native.install(toBcp47(I18nManager.getConstants().localeIdentifier)), g);
  }
}
