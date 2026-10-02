const assert = require('node:assert');
const test = require('node:test');
const install = require('../js/bootstrap');

// If Hermes ships its own Intl.Locale before the other constructors, ours must still read one of
// its objects as a one-locale list. Node's Intl.Locale stands in for it.
test("an engine's own Intl.Locale counts as one locale", () => {
  const intl = { Locale: Intl.Locale };
  install({ canonicalize: tag => tag, lookup: tag => tag }, { Intl: intl });
  assert.deepStrictEqual(intl.PluralRules.supportedLocalesOf(new Intl.Locale('de')), ['de']);
  assert.deepStrictEqual(intl.ListFormat.supportedLocalesOf([new Intl.Locale('fr'), 'de']), ['fr', 'de']);
});
