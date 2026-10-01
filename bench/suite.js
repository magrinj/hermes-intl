// Benchmark suite, identical for every implementation and host. Defines
// globalThis.hermesIntlBench(now) → [[label, value]…]; `now()` returns milliseconds.
(function (g) {
g.hermesIntlBench = function (now) {
  var rows = [];
  function us(ms) { return (ms * 1000).toFixed(2) + ' µs'; }
  function first(label, f) {
    var t = now();
    var r = f();
    rows.push([label, us(now() - t)]);
    return r;
  }
  function time(label, n, f) {
    var t = now();
    for (var i = 0; i < n; i++) f(i);
    rows.push([label, us((now() - t) / n)]);
  }

  var pl = first('PluralRules: first new("pl")', function () { return new Intl.PluralRules('pl'); });
  time('PluralRules: new("pl")', 500, function () { return new Intl.PluralRules('pl'); });
  time('PluralRules: select(integer)', 20000, function (i) { return pl.select(i); });
  time('PluralRules: select(decimal)', 20000, function (i) { return pl.select(i / 7); });
  if (pl.selectRange) time('PluralRules: selectRange', 5000, function (i) { return pl.selectRange(i, i + 5); });

  var rtf = first('RelativeTimeFormat: first new("pl")', function () { return new Intl.RelativeTimeFormat('pl'); });
  time('RelativeTimeFormat: new("pl")', 500, function () { return new Intl.RelativeTimeFormat('pl'); });
  first('RelativeTimeFormat: first format', function () { return rtf.format(-3, 'day'); });
  time('RelativeTimeFormat: format', 5000, function (i) { return rtf.format(i - 2500, 'day'); });
  time('RelativeTimeFormat: formatToParts', 5000, function (i) { return rtf.formatToParts(i - 2500, 'day'); });

  var lf = first('ListFormat: first new("pl")', function () { return new Intl.ListFormat('pl'); });
  time('ListFormat: new("pl")', 500, function () { return new Intl.ListFormat('pl'); });
  var items = ['Anna', 'Piotr', 'Zofia'];
  time('ListFormat: format(3 items)', 5000, function () { return lf.format(items); });
  time('ListFormat: formatToParts(3 items)', 5000, function () { return lf.formatToParts(items); });

  first('Locale: first new("pl-PL-u-ca-gregory")', function () { return new Intl.Locale('pl-PL-u-ca-gregory'); });
  time('Locale: new(tag)', 2000, function () { return new Intl.Locale('pl-PL-u-ca-gregory'); });
  var loc = new Intl.Locale('zh-TW');
  time('Locale: maximize()', 2000, function () { return loc.maximize(); });
  time('Locale: baseName', 20000, function () { return loc.baseName; });
  return rows;
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
