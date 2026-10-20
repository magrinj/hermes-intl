// Generates rust/src/number_data.rs: what Intl.NumberFormat needs from CLDR beyond ICU4X's data,
// the unit patterns of the sanctioned units and a few number symbols and patterns.
//   npm pack cldr-units-full@48.2.0 cldr-numbers-full@48.2.0 cldr-core@48.2.0
//   (extract each into <dir>/<package name>), then: node scripts/number-data.mjs <dir>
// Strings go in one pool indexed by number: a table of &str would cost a relocation per string.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) throw new Error('usage: node scripts/number-data.mjs <cldr json dir>');
const root = new URL('..', import.meta.url).pathname;
const pkg = (name) => join(dir, name, 'package');
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));

// IsSanctionedSingleUnitIdentifier, then the compound units CLDR names directly. Order shared with
// rust/src/number.rs.
const UNITS = [
  'acre', 'bit', 'byte', 'celsius', 'centimeter', 'day', 'degree', 'fahrenheit', 'fluid-ounce', 'foot', 'gallon',
  'gigabit', 'gigabyte', 'gram', 'hectare', 'hour', 'inch', 'kilobit', 'kilobyte', 'kilogram', 'kilometer', 'liter',
  'megabit', 'megabyte', 'meter', 'microsecond', 'mile', 'mile-scandinavian', 'milliliter', 'millimeter',
  'millisecond', 'minute', 'month', 'nanosecond', 'ounce', 'percent', 'petabyte', 'pound', 'second', 'stone',
  'terabit', 'terabyte', 'week', 'yard', 'year',
  'kilometer-per-hour', 'liter-per-kilometer', 'meter-per-second', 'mile-per-gallon', 'mile-per-hour',
];
const WIDTHS = ['long', 'short', 'narrow'];
const COUNTS = ['zero', 'one', 'two', 'few', 'many', 'other'];

const likely = json(join(pkg('cldr-core'), 'supplemental/likelySubtags.json')).supplemental.likelySubtags;
const parents = json(join(pkg('cldr-core'), 'supplemental/parentLocales.json')).supplemental.parentLocales.parentLocale;
const available = new Set(readdirSync(join(pkg('cldr-numbers-full'), 'main')));
const systems = json(join(pkg('cldr-core'), 'supplemental/numberingSystems.json')).supplemental.numberingSystems;
const DIGITS = Object.entries(systems).filter(([, s]) => s._type === 'numeric').map(([n, s]) => [n, s._digits]).sort();
// ICU4X names some locales without their script ("zh-HK"); CLDR files them under it ("zh-Hant-HK").
function cldrName(tag) {
  if (available.has(tag)) return tag;
  const [lang, region] = tag.split('-');
  const script = (likely[tag] ?? likely[lang] ?? '').split('-')[1];
  const full = `${lang}-${script}-${region}`;
  return available.has(full) ? full : tag;
}
// CLDR inheritance: an explicit parent, else the tag less its last subtag, else root.
function chain(name) {
  const out = [];
  for (let t = name; t; t = parents[t] ?? (t.includes('-') ? t.slice(0, t.lastIndexOf('-')) : t === 'und' ? '' : 'und')) {
    if (available.has(t)) out.push(t);
  }
  return out;
}
const cache = new Map();
function file(name, p, f, path) {
  const key = `${name}/${f}`;
  if (!cache.has(key)) {
    const full = join(pkg(p), 'main', name, f);
    cache.set(key, existsSync(full) ? path(json(full).main[name]) ?? {} : {});
  }
  return cache.get(key);
}
const resolve = (name, get) => {
  for (const t of chain(name)) {
    const v = get(t);
    if (v !== undefined) return v;
  }
};
const numbers = (t) => file(t, 'cldr-numbers-full', 'numbers.json', (m) => m.numbers);
const units = (t) => file(t, 'cldr-units-full', 'units.json', (m) => m.units);
const currencies = (t) => file(t, 'cldr-numbers-full', 'currencies.json', (m) => m.numbers?.currencies);
const unitKey = (t, width, unit) => Object.keys(units(t)[width] ?? {}).find((k) => k.replace(/^[a-z]+-/, '') === unit);

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
// A unit at one width: its plural patterns, its "per" pattern and its display name.
const sets = [];
const setIds = new Map();
const internSet = (set) => {
  const k = set.join(',');
  if (!setIds.has(k)) {
    setIds.set(k, sets.length);
    sets.push(set);
  }
  return setIds.get(k);
};

const locales = readFileSync(join(root, 'rust/locales/recommended.txt'), 'utf8').split(/\s+/).filter(Boolean);
if (!locales.includes('und')) locales.push('und');
const rows = [];
const rowIds = new Map();
const table = [];
for (const tag of locales) {
  const name = cldrName(tag);
  const nu = resolve(name, (t) => numbers(t).defaultNumberingSystem) ?? 'latn';
  const symbol = (key) => resolve(name, (t) => (numbers(t)[`symbols-numberSystem-${nu}`] ?? numbers(t)['symbols-numberSystem-latn'])?.[key]);
  const misc = (key) => resolve(name, (t) => (numbers(t)[`miscPatterns-numberSystem-${nu}`] ?? numbers(t)['miscPatterns-numberSystem-latn'])?.[key]);
  const row = [intern(symbol('nan')), intern(symbol('exponential')), intern(misc('approximately')), intern(misc('range'))];
  for (const w of WIDTHS) row.push(intern(resolve(name, (t) => units(t)[w]?.per?.compoundUnitPattern)));
  // Per numbering system with symbols here: percent sign, currency decimal and group ("" if none).
  const systemsHere = new Set(chain(name).filter((t) => t !== 'und').flatMap((t) => Object.keys(numbers(t)).filter((k) => k.startsWith('symbols-numberSystem-')).map((k) => k.slice(21))));
  systemsHere.add('latn');
  row.push(intern([...systemsHere].sort().map((s) => {
    const sym = (key) => resolve(name, (t) => numbers(t)[`symbols-numberSystem-${s}`]?.[key]) ?? '';
    return [s, sym('percentSign'), sym('currencyDecimal'), sym('currencyGroup')].join('\u001f');
  }).join('\u001e')));
  // Currencies whose symbol here is their code, where an ancestor has another (ICU4X then returns
  // the ancestor's): short, then narrow.
  for (const key of ['symbol', 'symbol-alt-narrow']) {
    const codes = new Set(chain(name).flatMap((t) => Object.keys(currencies(t))));
    row.push(intern([...codes].sort().filter((c) => {
      const values = chain(name).map((t) => currencies(t)[c]?.[key]).filter((v) => v !== undefined);
      return values[0] === c && values.some((v) => v !== c);
    }).join('')));
  }
  // Currencies with their own decimal and group separators (the escudo's "$"), joined as above.
  const own = [...new Set(chain(name).flatMap((t) => Object.keys(currencies(t))))].sort().flatMap((c) => {
    const sep = (key) => resolve(name, (t) => currencies(t)[c]?.[key]) ?? '';
    return sep('decimal') || sep('group') ? [[c, sep('decimal'), sep('group')].join('\u001f')] : [];
  });
  row.push(intern(own.join('\u001e')));
  for (const unit of UNITS) {
    for (const w of WIDTHS) {
      const field = (key) => resolve(name, (t) => {
        const k = unitKey(t, w, unit);
        return k && units(t)[w][k][key];
      });
      row.push(internSet([...COUNTS.map((c) => intern(field(`unitPattern-count-${c}`))), intern(field('perUnitPattern')), intern(field('displayName'))]));
    }
  }
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
const out = `// Generated by scripts/number-data.mjs from CLDR ${json(join(pkg('cldr-core'), 'package.json')).version}. Do not edit.

pub const UNITS: [&str; ${UNITS.length}] = ${JSON.stringify(UNITS)};

// CLDR's numeric numbering systems and their digits, by name.
pub static NUMBERING_SYSTEMS: [(&str, &str); ${DIGITS.length}] = [${DIGITS.map(([n, d]) => `(${JSON.stringify(n)}, ${lit(d)})`).join(',')}];

pub static TEXT: &str = ${lit(text)};
pub static STARTS: [u32; ${starts.length}] = [${starts.join(',')}];
pub static TAGS: &str = ${lit(tags)};
pub static TAG_STARTS: [u16; ${tagStarts.length}] = [${tagStarts.join(',')}];
pub static TAG_ROWS: [u16; ${table.length}] = [${table.map((t) => t[1]).join(',')}];
// Per unit and width: the patterns for zero, one, two, few, many and other, the per-unit pattern and
// the display name.
pub static SETS: [[u16; 8]; ${sets.length}] = [${sets.map((r) => `[${r.join(',')}]`).join(',')}];
// Per row: nan, exponential, the approximately and range patterns, the compound "per" pattern long,
// short and narrow, the numbering system symbols (nu, percent, currency decimal and group, joined
// by U+1F, entries by U+1E), the codes used as symbol and as narrow symbol, the currencies with
// their own decimal and group (joined the same way), then a SETS index per unit and width (long,
// short, narrow).
pub static ROWS: [[u16; ${rows[0].length}]; ${rows.length}] = [${rows.map((r) => `[${r.join(',')}]`).join(',')}];
`;
writeFileSync(join(root, 'rust/src/number_data.rs'), out);
console.log(`${table.length} locales, ${rows.length} rows, ${sets.length} sets, ${pool.length} strings, ${Buffer.byteLength(text)} bytes of text`);
