// Intl.DurationFormat against the test262 cases whose expectations need a full Intl.NumberFormat
// (host/duration-format-golden.mjs). Run after host/duration-format-cases.js.
var failures = [];
for (var i = 0; i < DURATION_CASES.length; i++) {
  var c = DURATION_CASES[i];
  var df = new Intl.DurationFormat(c.locales, c.options);
  var actual = df[c.method](c.duration);
  var expected = c.output;
  if (c.method === 'formatToParts') {
    // As test262 compares parts: type and value, and the unit when one is expected.
    actual = JSON.stringify(actual.map(function (p, k) {
      return expected[k] && expected[k].unit ? [p.type, p.value, p.unit] : [p.type, p.value];
    }));
    expected = JSON.stringify(expected.map(function (p) { return p.unit ? [p.type, p.value, p.unit] : [p.type, p.value]; }));
  }
  if (actual !== expected) failures.push(JSON.stringify(c.options) + ' ' + JSON.stringify(c.duration) + ' ' + c.method + ': ' + actual + ' !== ' + expected);
}
// Not from Node, which has no [[TwoDigitHours]]: Afrikaans pads numeric hours only.
[['long', '1 uur, 2 minute'], ['digital', '01:02:00']].forEach(function (c) {
  var actual = new Intl.DurationFormat('af', { style: c[0] }).format({ hours: 1, minutes: 2 });
  if (actual !== c[1]) failures.push('af ' + c[0] + ': ' + actual + ' !== ' + c[1]);
});
if (failures.length) throw new Error(failures.length + ' DurationFormat cases differ:\n' + failures.join('\n'));
print('duration format: ' + DURATION_CASES.length + ' cases ok');
