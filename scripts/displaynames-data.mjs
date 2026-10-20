// Generates rust/src/displaynames_data.rs: the Intl.DisplayNames names ICU4X has no data for
// (calendars, date-time fields) and each locale's display pattern, from CLDR JSON.
//   npm pack cldr-localenames-full@48.2.0 cldr-dates-full@48.2.0 cldr-core@48.2.0
//   (extract each into <dir>/<package name>), then: node scripts/displaynames-data.mjs <dir>
// Strings go in one pool indexed by number: a table of &str would cost a relocation per string.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) throw new Error('usage: node scripts/displaynames-data.mjs <cldr json dir>');
const root = new URL('..', import.meta.url).pathname;
const pkg = (name) => join(dir, name, 'package');
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));

// Column order, shared with rust/src/displaynames.rs.
const CALENDARS = {
  buddhist: 'buddhist', chinese: 'chinese', coptic: 'coptic', dangi: 'dangi', ethioaa: 'ethiopic-amete-alem',
  ethiopic: 'ethiopic', gregory: 'gregorian', hebrew: 'hebrew', indian: 'indian', islamic: 'islamic',
  'islamic-civil': 'islamic-civil', 'islamic-rgsa': 'islamic-rgsa', 'islamic-tbla': 'islamic-tbla',
  'islamic-umalqura': 'islamic-umalqura', iso8601: 'iso8601', japanese: 'japanese', persian: 'persian', roc: 'roc',
};
const FIELDS = {
  era: 'era', year: 'year', quarter: 'quarter', month: 'month', weekOfYear: 'week', weekday: 'weekday', day: 'day',
  dayPeriod: 'dayperiod', hour: 'hour', minute: 'minute', second: 'second', timeZoneName: 'zone',
};

const likely = json(join(pkg('cldr-core'), 'supplemental/likelySubtags.json')).supplemental.likelySubtags;
const available = new Set(readdirSync(join(pkg('cldr-localenames-full'), 'main')));
// ICU4X names some locales without their script ("zh-HK"); CLDR files them under it ("zh-Hant-HK").
function cldrName(tag) {
  if (available.has(tag)) return tag;
  const [lang, region] = tag.split('-');
  const script = (likely[tag] ?? likely[lang] ?? '').split('-')[1];
  const full = `${lang}-${script}-${region}`;
  return available.has(full) ? full : tag;
}

const parents = json(join(pkg('cldr-core'), 'supplemental/parentLocales.json')).supplemental.parentLocales.parentLocale;
// CLDR inheritance: an explicit parent, else the tag less its last subtag, else root.
function chain(name) {
  const out = [];
  for (let t = name; t; t = parents[t] ?? (t.includes('-') ? t.slice(0, t.lastIndexOf('-')) : t === 'und' ? '' : 'und')) {
    if (available.has(t)) out.push(t);
  }
  return out;
}
const cache = new Map();
function file(name, p, file, path) {
  const key = `${name}/${file}`;
  if (!cache.has(key)) {
    const f = join(pkg(p), 'main', name, file);
    cache.set(key, existsSync(f) ? path(json(f).main[name]) ?? {} : {});
  }
  return cache.get(key);
}
const resolve = (name, get) => {
  for (const t of chain(name)) {
    const v = get(t);
    if (v !== undefined) return v;
  }
};
const calendarName = (name, key) =>
  resolve(name, (t) => file(t, 'cldr-localenames-full', 'localeDisplayNames.json', (m) => m.localeDisplayNames).types?.calendar?.[key]);
const fieldName = (name, key) =>
  resolve(name, (t) => file(t, 'cldr-dates-full', 'dateFields.json', (m) => m.dates.fields)[key]?.displayName);
const pattern = (name, key) =>
  resolve(name, (t) => file(t, 'cldr-localenames-full', 'localeDisplayNames.json', (m) => m.localeDisplayNames).localeDisplayPattern?.[key]);

// ICU4X leaves out names equal to their code ("Thai", the short "US"): found here, they become a
// per-locale bit mask, so that fallback "none" still sees them.
const namesDir = join(pkg('cldr-localenames-full'), 'main');
const SELF_NAMED = { languages: new Set(), scripts: new Set(), territories: new Set() };
for (const l of readdirSync(namesDir)) {
  for (const key of Object.keys(SELF_NAMED)) {
    const names = file(l, 'cldr-localenames-full', `${key}.json`, (m) => m.localeDisplayNames[key]);
    for (const [k, v] of Object.entries(names)) {
      const code = k.replace(/-alt-.*/, '');
      if (v === code && (key !== 'territories' || k.endsWith('-alt-short'))) SELF_NAMED[key].add(code);
    }
  }
}
const selfNamed = Object.entries(SELF_NAMED).flatMap(([key, set]) => [...set].sort().map((code) => [key, code]));
if (selfNamed.length > 32) throw new Error('too many self-named codes for a 32-bit mask');
const selfMask = (name) => {
  let mask = 0;
  selfNamed.forEach(([key, code], i) => {
    const k = key === 'territories' ? `${code}-alt-short` : code;
    if (resolve(name, (t) => file(t, 'cldr-localenames-full', `${key}.json`, (m) => m.localeDisplayNames[key])[k]) === code) {
      mask |= 1 << i;
    }
  });
  return mask >>> 0;
};

const pool = [];
const ids = new Map();
const intern = (s) => {
  if (s === undefined) return 0xffff;
  if (!ids.has(s)) {
    ids.set(s, pool.length);
    pool.push(s);
  }
  return ids.get(s);
};

const locales = readFileSync(join(root, 'rust/locales/recommended.txt'), 'utf8').split(/\s+/).filter(Boolean);
if (!locales.includes('und')) locales.push('und');
const rows = [];
const rowIds = new Map();
const table = [];
for (const tag of locales) {
  const name = cldrName(tag);
  const row = [];
  for (const key of Object.values(CALENDARS)) row.push(intern(calendarName(name, key)));
  for (const suffix of ['', '-short', '-narrow']) {
    for (const key of Object.values(FIELDS)) row.push(intern(fieldName(name, key + suffix)));
  }
  row.push(intern(pattern(name, 'localePattern')), intern(pattern(name, 'localeSeparator')));
  const mask = selfMask(name);
  row.push(mask & 0xffff, mask >>> 16);
  const k = row.join(',');
  if (!rowIds.has(k)) {
    rowIds.set(k, rows.length);
    rows.push(row);
  }
  table.push([tag, rowIds.get(k)]);
}
table.sort((a, b) => (a[0] < b[0] ? -1 : 1));

let text = '';
const starts = [];
for (const s of pool) {
  starts.push(Buffer.byteLength(text));
  text += s;
}
starts.push(Buffer.byteLength(text));
let tags = '';
const tagStarts = [];
for (const [tag] of table) {
  tagStarts.push(tags.length);
  tags += tag;
}
tagStarts.push(tags.length);

// Invisible and spacing characters are escaped: rustc and clippy reject them in literals.
const lit = (s) =>
  JSON.stringify(s)
    .replace(/\\u([0-9a-f]{4})/g, (_, h) => `\\u{${h}}`)
    .replace(/[\p{Cf}\p{Z}]/gu, (c) => (c === ' ' ? c : `\\u{${c.codePointAt(0).toString(16)}}`));
const out = `// Generated by scripts/displaynames-data.mjs from CLDR ${json(join(pkg('cldr-core'), 'package.json')).version}. Do not edit.

pub const CALENDARS: [&str; ${Object.keys(CALENDARS).length}] = ${JSON.stringify(Object.keys(CALENDARS))};
pub const FIELDS: [&str; ${Object.keys(FIELDS).length}] = ${JSON.stringify(Object.keys(FIELDS))};

// Bit i of a row's mask: the locale names SELF_NAMED[i] by its code (regions: the short name).
pub const SELF_NAMED: [(&str, &str); ${selfNamed.length}] = [${selfNamed.map(([k, c]) => `(${JSON.stringify(k)},${JSON.stringify(c)})`).join(',')}];

pub static TEXT: &str = ${lit(text)};
pub static STARTS: [u32; ${starts.length}] = [${starts.join(',')}];
pub static TAGS: &str = ${lit(tags)};
pub static TAG_STARTS: [u16; ${tagStarts.length}] = [${tagStarts.join(',')}];
pub static TAG_ROWS: [u16; ${table.length}] = [${table.map((t) => t[1]).join(',')}];
// Per row: the calendars, the fields long, short and narrow, the locale pattern and separator, then
// the SELF_NAMED mask (low, high).
pub static ROWS: [[u16; ${rows[0].length}]; ${rows.length}] = [${rows.map((r) => `[${r.join(',')}]`).join(',')}];
`;
writeFileSync(join(root, 'rust/src/displaynames_data.rs'), out);
console.log(`${table.length} locales, ${rows.length} rows, ${pool.length} strings, ${Buffer.byteLength(text)} bytes of text`);
