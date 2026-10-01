const assert = require('node:assert');
const test = require('node:test');

// Jest runs the entry untransformed on Node (no HermesInternal): it must parse and do nothing.
test('the entry loads in plain Node and leaves Intl alone', () => {
  const pluralRules = Intl.PluralRules;
  require('../src/index.js');
  assert.strictEqual(Intl.PluralRules, pluralRules);
});
