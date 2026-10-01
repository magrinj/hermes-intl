// Installs the Intl constructors Hermes lacks (PluralRules, RelativeTimeFormat, ListFormat,
// Locale). Import it first in the app entry, before anything that uses Intl:
//   import 'hermes-intl';
// No-op on other engines (JSC, V8, web), which already ship these constructors.
import { I18nManager } from 'react-native';
import NativeHermesIntl from './NativeHermesIntl';
import { toBcp47 } from './hostLocale';

const g = globalThis;

if (typeof g.HermesInternal === 'object' && g.HermesInternal !== null) {
  if (NativeHermesIntl == null) {
    console.warn('hermes-intl: native module not found. Rebuild the app after installing the package.');
  } else {
    const hostLocale = toBcp47(I18nManager.getConstants().localeIdentifier);
    require('../js/bootstrap')(NativeHermesIntl.install(hostLocale), g);
  }
}
