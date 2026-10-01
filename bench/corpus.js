// Correctness corpus (RelativeTimeFormat, ListFormat, Locale), one line per case, shared by the macOS host,
// node (V8 reference: `node bench/corpus.js`) and example/. Defines hermesIntlCorpus() and hermesIntlHash(lines).
(function (g) {
g.hermesIntlCorpus = function () {
  var lines = [];
  var out = function (l) { lines.push(l); };
  var locales = ['en', 'fr', 'de', 'pl', 'ar'];
  var units = ['second', 'minute', 'hour', 'day', 'week', 'month', 'quarter', 'year'];
  var values = [-2, -1, -0, 0, 1, 2, 1.5, -3.25, 1000, 0.9999];
  locales.forEach(function (l) {
    ['long', 'short', 'narrow'].forEach(function (style) {
      ['always', 'auto'].forEach(function (numeric) {
        var rtf = new Intl.RelativeTimeFormat(l, { style: style, numeric: numeric });
        units.forEach(function (u) {
          values.forEach(function (v) { out('rtf ' + l + ' ' + style + ' ' + numeric + ' ' + u + ' ' + v + ' = ' + rtf.format(v, u)); });
        });
      });
    });
    var parts = new Intl.RelativeTimeFormat(l).formatToParts(-1234.5, 'day');
    out('rtfParts ' + l + ' = ' + JSON.stringify(parts));
    ['conjunction', 'disjunction', 'unit'].forEach(function (type) {
      ['long', 'short', 'narrow'].forEach(function (style) {
        var lf = new Intl.ListFormat(l, { type: type, style: style });
        [[], ['A'], ['A', 'B'], ['A', 'B', 'C'], ['A', 'B', 'C', 'D']].forEach(function (items) {
          out('list ' + l + ' ' + type + ' ' + style + ' ' + items.length + ' = ' + lf.format(items));
        });
      });
    });
    out('listParts ' + l + ' = ' + JSON.stringify(new Intl.ListFormat(l).formatToParts(['A', 'B', 'C'])));
  });
  ['en', 'zh-TW', 'sr-Latn', 'und-150', 'mo', 'en-u-ca-islamicc-kn', 'de-DE-u-co-phonebk', 'ar-EG', 'iw', 'sgn-GR', 'hy-arevmda', 'es-419'].forEach(function (t) {
    var loc = new Intl.Locale(t);
    out('locale ' + t + ' = ' + loc + ' base=' + loc.baseName + ' max=' + loc.maximize() + ' min=' + loc.minimize() +
      ' lang=' + loc.language + ' script=' + loc.script + ' region=' + loc.region + ' cal=' + loc.calendar + ' kn=' + loc.numeric);
  });
  ['en-US', 'fr-FR', 'ar-EG', 'he-IL', 'ja-JP', 'th-TH', 'fa-IR', 'en-GB', 'de'].forEach(function (t) {
    var loc = new Intl.Locale(t);
    if (typeof loc.getWeekInfo !== 'function') return; // older engines (node 22) predate Locale Info
    out('info ' + t + ' week=' + JSON.stringify(loc.getWeekInfo()) + ' dir=' + loc.getTextInfo().direction +
      ' cal=' + loc.getCalendars() + ' hc=' + loc.getHourCycles() + ' nu=' + loc.getNumberingSystems() +
      ' tz=' + (loc.getTimeZones() || []).length);
  });
  return lines;
};

// FNV-1a over all lines, as 8 hex digits.
g.hermesIntlHash = function (lines) {
  var h = 0x811c9dc5;
  var s = lines.join('\n');
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
};

if (typeof module !== 'undefined' && require.main === module) {
  g.hermesIntlCorpus().forEach(function (l) { console.log(l); });
}
})(typeof globalThis !== 'undefined' ? globalThis : this);
