// FormatJS PluralRules on decimals, against the engine's own (V8 in Node): `node formatjs-plurals.js`.
const cases = [['ar', 1.5, 'cardinal'], ['ar', 2.5, 'cardinal'], ['en', 1.5, 'ordinal']];
const native = cases.map(([l, n, type]) => new Intl.PluralRules(l, { type }).select(n));
require('@formatjs/intl-pluralrules/polyfill-force.js');
for (const l of ['ar', 'en']) require(`@formatjs/intl-pluralrules/locale-data/${l}.js`);
cases.forEach(([l, n, type], i) =>
  console.log(`${l} ${type} ${n}: V8 ${native[i]}, FormatJS ${new Intl.PluralRules(l, { type }).select(n)}`),
);
