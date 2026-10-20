// Installs the Intl constructors Hermes lacks (PluralRules, RelativeTimeFormat, ListFormat,
// Locale). Import it first in the app entry, before anything that uses Intl:
//   import 'hermes-intl';
// No-op on other engines (JSC, V8, web, Jest), which already ship these constructors.
// Plain CommonJS, so Jest loads it without a transform.
const g = globalThis;
// Plain JS that touches nothing when loaded.
const bootstrap = require('../js/bootstrap');
let installed; // the host functions, kept for worklet runtimes

if (typeof g.HermesInternal === 'object' && g.HermesInternal !== null) {
  const { I18nManager, TurboModuleRegistry } = require('react-native');
  const native = TurboModuleRegistry.get('NativeHermesIntl');
  if (native == null) {
    console.warn('hermes-intl: native module not found. Rebuild the app after installing the package.');
  } else {
    const { toBcp47 } = require('./hostLocale');
    installed = native.install(toBcp47(I18nManager.getConstants().localeIdentifier));
    bootstrap(installed, g);
  }
}

// Runs on the worklet runtime: react-native-worklets' Babel plugin turns it, and the bootstrap,
// into worklets. The host functions are a HostObject, which worklets passes by reference.
function install(native) {
  'worklet';
  bootstrap(native, globalThis);
}

// Installs the same constructors on a react-native-worklets runtime (one from createWorkletRuntime),
// or on the UI runtime by default, before returning. Needs react-native-worklets and its Babel plugin.
function installOnWorkletRuntime(runtime) {
  if (installed === undefined) return;
  let worklets;
  // Inside a try, Metro treats it as optional: apps without react-native-worklets still bundle.
  try {
    worklets = require('react-native-worklets');
  } catch {
    throw new Error('hermes-intl: installOnWorkletRuntime needs react-native-worklets.');
  }
  if (runtime === undefined) worklets.runOnUISync(install, installed);
  else worklets.runOnRuntimeSync(runtime, install, installed);
}

module.exports = { installOnWorkletRuntime };
