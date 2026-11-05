const assert = require('node:assert/strict');
const { test } = require('node:test');
const install = require('../js/bootstrap');

// Observe the mathematical value handed to native code without depending on the host's Intl data.
function capture(method, value) {
  let received;
  const intl = {};
  install({
    defaultLocale: 'en',
    canonicalize: tag => tag,
    lookup: tag => tag,
    localeNumberingSystem: () => 'latn',
    prNew: () => 0,
    prCategories: () => 34,
    prSelect: (_, input) => { received = input; return 5; },
    prSelectRange: (_, start, end) => { received = [start, end]; return 5; },
    nfNew: () => 0,
    nfFormat: (_, input) => { received = input; return ''; },
    nfFormatRange: (_, start, end) => { received = [start, end]; return ''; },
  }, { Intl: intl });
  if (method === 'select') new intl.PluralRules('en').select(value);
  else if (method === 'selectRange') new intl.PluralRules('en').selectRange(value, value);
  else if (method === 'formatRange') new intl.NumberFormat('en').formatRange(value, value);
  else new intl.NumberFormat('en').format(value);
  return received;
}

const boundaries = [
  ['0e32768', 0],
  ['0e-32769', 0],
  ['-0e32768', -0],
  ['-0e-32769', -0],
  ['1e-32769', 0],
  ['-1e-32769', -0],
  ['1e-324', 0],
  ['-1e-324', -0],
  ['1e309', Infinity],
  ['-1e309', -Infinity],
  ['1e32768', Infinity],
  ['-1e32768', -Infinity],
  ['1.7976931348623159e308', Infinity],
  ['-1.7976931348623159e308', -Infinity],
];

for (const method of ['select', 'selectRange', 'format', 'formatRange']) {
  const range = method.endsWith('Range');
  test(`${method} saturates decimal strings at the Number range boundaries`, () => {
    for (const [input, expected] of boundaries) {
      assert.deepEqual(capture(method, input), range ? [expected, expected] : expected, input);
    }
  });

  test(`${method} retains exact finite nonzero decimal strings`, () => {
    for (const input of ['5e-324', '-5e-324', '1.7976931348623157e308', '9007199254740993', '1.0000000000000000000001']) {
      assert.deepEqual(capture(method, input), range ? [input, input] : input, input);
    }
  });

  test(`${method} does not saturate BigInts`, () => {
    for (const input of [1n, 10n ** 400n, -(10n ** 400n)]) {
      const expected = String(input);
      assert.deepEqual(capture(method, input), range ? [expected, expected] : expected);
    }
  });

  test(`${method} coerces each object argument once with a number hint`, () => {
    let calls = 0;
    const input = {
      [Symbol.toPrimitive](hint) {
        assert.equal(hint, 'number');
        calls++;
        return '-1e-32769';
      },
    };
    assert.deepEqual(capture(method, input), range ? [-0, -0] : -0);
    assert.equal(calls, range ? 2 : 1);
  });
}
