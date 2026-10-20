// Side-effect import: defines Intl.PluralRules, Intl.RelativeTimeFormat, Intl.ListFormat,
// Intl.Segmenter, Intl.DisplayNames, Intl.DurationFormat and Intl.Locale on Hermes. Their types
// come from TypeScript's own lib.

/**
 * Installs the same Intl constructors on a react-native-worklets runtime: the one given (from
 * `createWorkletRuntime`), or the UI runtime. Synchronous. A no-op off Hermes.
 * Needs react-native-worklets and its Babel plugin.
 */
export function installOnWorkletRuntime(runtime?: object): void;
