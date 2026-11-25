// Outputs checked against Node (ICU). Run: host/build/hi-host host/regressions.js
function check(actual, expected, what) {
  if (actual !== expected) throw new Error(what + ': got ' + JSON.stringify(actual) + ', expected ' + JSON.stringify(expected));
}

// iOS spells Hong Kong's locale zh-Hant-HK: zh-HK's data, not zh-Hant's (Taiwan).
check(new Intl.ListFormat('zh-Hant-HK').format(['a', 'b', 'c']), 'a、b及c', 'zh-Hant-HK list');
check(new Intl.RelativeTimeFormat('zh-Hant-HK').resolvedOptions().locale, 'zh-Hant-HK', 'zh-Hant-HK locale');
check(new Intl.NumberFormat('zh-Hant-TW').resolvedOptions().locale, 'zh-Hant-TW', 'zh-Hant-TW locale');
check(new Intl.RelativeTimeFormat('sr-Cyrl-BA').format(-2, 'day'), 'прије 2 дана', 'sr-Cyrl-BA');

var surrogates = ['\ud800', 'x\udfff'];
check(new Intl.ListFormat('en').format(surrogates), '\ud800 and x\udfff', 'lone surrogates');
check(new Intl.ListFormat('en').formatToParts(surrogates)[2].value, 'x\udfff', 'lone surrogate part');

var frLong = new Intl.NumberFormat('fr', { notation: 'compact', compactDisplay: 'long' });
check(frLong.format(1000) + '|' + frLong.format(-1000), 'mille|-1 millier', 'fr compact long');
var usd = { notation: 'compact', compactDisplay: 'long', style: 'currency', currency: 'USD' };
check(new Intl.NumberFormat('en', usd).format(1234), '$1.2K', 'compact long currency');
usd.currencyDisplay = 'name';
check(new Intl.NumberFormat('en', usd).format(1234), '1.2 thousand US dollars', 'compact long currency name');

var percent = { style: 'unit', unit: 'percent' };
check(new Intl.NumberFormat('de', percent).format(1), '1 %', 'de percent unit');
check(new Intl.NumberFormat('tr', percent).format(-1), '-%1', 'tr percent unit');
check(new Intl.NumberFormat('de', percent).formatToParts(1)[2].type, 'unit', 'percent unit part');
print('regressions: ok');
