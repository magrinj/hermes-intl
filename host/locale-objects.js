// Hermes's own Intl constructors and toLocale* methods given an Intl.Locale object, which they
// must read as a one-locale list. Run: host/build/hi-host host/locale-objects.js
function check(actual, expected, what) {
  if (actual !== expected) throw new Error(what + ': got ' + actual + ', expected ' + expected);
}

var de = new Intl.Locale('de');
var date = new Date(0);
var utc = { timeZone: 'UTC' };
check(new Intl.NumberFormat(de).resolvedOptions().locale, 'de', 'new NumberFormat');
check(Intl.NumberFormat(de).resolvedOptions().locale, 'de', 'NumberFormat without new');
check(new Intl.DateTimeFormat(de).resolvedOptions().locale, 'de', 'DateTimeFormat');
check(new Intl.Collator(de).resolvedOptions().locale, 'de', 'Collator');
check(new Intl.NumberFormat([de]).resolvedOptions().locale, 'de', 'NumberFormat with a list');
check(Intl.DateTimeFormat.supportedLocalesOf(de)[0], 'de', 'supportedLocalesOf');
check((1234.5).toLocaleString(de), (1234.5).toLocaleString('de'), 'Number toLocaleString');
check(date.toLocaleString(de, utc), date.toLocaleString('de', utc), 'Date toLocaleString');
check(date.toLocaleDateString(de, utc), date.toLocaleDateString('de', utc), 'toLocaleDateString');
check(date.toLocaleTimeString(de, utc), date.toLocaleTimeString('de', utc), 'toLocaleTimeString');
check('a'.localeCompare('z', new Intl.Locale('sv')), 'a'.localeCompare('z', 'sv'), 'localeCompare');
check('I'.toLocaleLowerCase(new Intl.Locale('tr')), 'I'.toLocaleLowerCase('tr'), 'toLocaleLowerCase');

// The wrapped built-ins keep their shape.
var NF = Intl.NumberFormat;
check(new NF('en') instanceof NF, true, 'instanceof');
check(NF.prototype.constructor, NF, 'prototype.constructor');
check(NF.name + NF.length, 'NumberFormat0', 'name and length');
check(Object.getOwnPropertyDescriptor(Intl, 'NumberFormat').enumerable, false, 'Intl.NumberFormat enumerable');
check(Object.getOwnPropertyDescriptor(NF, 'prototype').writable, false, 'prototype writable');
check(String.prototype.localeCompare.name + String.prototype.localeCompare.length, 'localeCompare1', 'localeCompare shape');
check(Number.prototype.toLocaleString.length, 0, 'toLocaleString length');

// A subclass instance gets the subclass's prototype, which Hermes alone does not give it.
class MyNF extends NF {}
var mine = new MyNF(de);
check(mine instanceof MyNF && mine instanceof NF, true, 'subclass instanceof');
check(mine.resolvedOptions().locale + ' ' + mine.format(1.5), 'de 1,5', 'subclass instance works');

// A list is read once, and a Locale in it counts by its tag, not by a patched toString.
var reads = 0;
var list = { length: 1, get 0() { reads++; return 'de'; } };
check(new NF(list).resolvedOptions().locale + ' ' + reads, 'de 1', 'list read once');
var localeToString = Intl.Locale.prototype.toString;
Intl.Locale.prototype.toString = function () { return 'en'; };
check(new NF([de]).resolvedOptions().locale, 'de', 'Locale in a list with toString patched');
Intl.Locale.prototype.toString = localeToString;
print('locale objects: ok');
