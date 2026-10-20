//! Intl.NumberFormat core (§16), for Hermes builds whose own NumberFormat has no formatToParts
//! (Apple platforms, where it also ignores compact notation, signDisplay and -u-nu-). The JS shell
//! resolves the options; FormatNumericToString and ComputeExponent are plural.rs's.

use crate::number_data as data;
use crate::parts::{self, Seg};
use crate::plural::{self, Options, Rules};
use fixed_decimal::{Decimal, Sign};
use icu::decimal::options::{DecimalFormatterOptions, GroupingStrategy};
use icu::decimal::provider::{
    DecimalDigitsV1, DecimalSymbolStrsBuilder, DecimalSymbols, DecimalSymbolsV1,
};
use icu::decimal::DecimalFormatter;
use icu::locale::extensions::unicode::key;
use icu::locale::preferences::extensions::unicode::keywords::CurrencyType;
use icu::locale::Locale;
use icu::plurals::PluralCategory;
use icu_experimental::dimension::provider::currency::essentials::CurrencyEssentialsV1;
use icu_experimental::dimension::provider::currency::extended::CurrencyExtendedDataV1;
use icu_experimental::dimension::provider::currency::fractions::CurrencyFractionsV1;
use icu_experimental::dimension::provider::currency::patterns::CurrencyPatternsDataV1;
use icu_experimental::dimension::provider::currency::symbols::CurrencySymbolsV1;
use icu_experimental::dimension::provider::percent::PercentEssentialsV1;
use icu_experimental::provider::Baked;
use icu_provider::prelude::*;
use tinystr::TinyAsciiStr;
use writeable::Writeable;
use zerovec::VarZeroCow;

/// The resolved options, as js/bootstrap.js passes them.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct NumberOptions {
    pub digits: Options,
    /// 0 decimal, 1 percent, 2 currency, 3 unit
    pub style: u8,
    pub currency: [u8; 3],
    /// 0 code, 1 symbol, 2 narrowSymbol, 3 name
    pub currency_display: u8,
    pub accounting: bool,
    /// 0 long, 1 short, 2 narrow
    pub unit_display: u8,
    /// 0 auto, 1 always, 2 min2, 3 false
    pub grouping: u8,
    /// 0 auto, 1 never, 2 always, 3 exceptZero, 4 negative
    pub sign_display: u8,
    pub min_integer: u8,
}

/// A JS numeric value: NaN, ±∞ or a mathematical value (possibly negative zero).
pub enum Value {
    NaN,
    Infinity(bool),
    Finite(Decimal),
}

enum Style {
    Decimal,
    Percent {
        essentials: DataPayload<PercentEssentialsV1>,
        /// ICU4X's percent sign (the locale's latn one) and the numbering system's.
        sign: (&'static str, &'static str),
    },
    Currency {
        essentials: DataPayload<CurrencyEssentialsV1>,
        text: String,
        letters: (bool, bool),
    },
    // ICU's fallback for a locale without names: the code, after the number.
    CurrencyName {
        names: Option<DataPayload<CurrencyExtendedDataV1>>,
        patterns: Option<DataPayload<CurrencyPatternsDataV1>>,
        code: String,
    },
    Unit {
        unit: usize,
        per: Option<usize>,
        width: usize,
    },
}

pub struct NumberFormat {
    rules: Rules,
    style: Style,
    o: NumberOptions,
    decimal: DecimalFormatter,
    // For the exponent digits.
    plain: DecimalFormatter,
    symbols: DataPayload<DecimalSymbolsV1>,
    row: Row,
}

/// A formatted number in ICU's layers, kept apart for formatRange.
#[derive(Default, Clone, PartialEq)]
struct Layers {
    /// Unit and currency-name patterns.
    outer: [Vec<Seg>; 2],
    /// Sign, currency symbol, percent sign, compact affixes.
    middle: [Vec<Seg>; 2],
    /// Digits, with the exponent.
    inner: Vec<Seg>,
    exponent: bool,
    plural: Option<PluralCategory>,
}

impl Layers {
    fn flat(&self) -> Vec<Seg> {
        let mut out = self.outer[0].clone();
        out.extend_from_slice(&self.middle[0]);
        out.extend_from_slice(&self.inner);
        out.extend_from_slice(&self.middle[1]);
        out.extend_from_slice(&self.outer[1]);
        out
    }
}

type Row = &'static [u16];

/// The data row of an available locale, or of its nearest ancestor in the table.
fn row(locale: &str) -> Row {
    let tag =
        |i: usize| &data::TAGS[data::TAG_STARTS[i] as usize..data::TAG_STARTS[i + 1] as usize];
    let find = |t: &str| -> Option<Row> {
        let (mut lo, mut hi) = (0, data::TAG_ROWS.len());
        while lo < hi {
            let mid = (lo + hi) / 2;
            match tag(mid).cmp(t) {
                core::cmp::Ordering::Less => lo = mid + 1,
                core::cmp::Ordering::Greater => hi = mid,
                core::cmp::Ordering::Equal => {
                    return Some(&data::ROWS[data::TAG_ROWS[mid] as usize])
                }
            }
        }
        None
    };
    if let Some(r) = crate::locale::with_implied_script(locale)
        .iter()
        .find_map(|t| find(t))
    {
        return r;
    }
    let mut t = locale;
    loop {
        if let Some(r) = find(t) {
            return r;
        }
        t = match t.rfind('-') {
            Some(at) => &t[..at],
            None if t != "und" => "und",
            None => return &data::ROWS[0],
        };
    }
}

/// Adjacent literals as one part, as ICU has them.
fn merge_literals(segs: Vec<Seg>) -> Vec<Seg> {
    let mut out: Vec<Seg> = Vec::with_capacity(segs.len());
    for s in segs {
        match out.last_mut() {
            Some(last) if last.0 == s.0 && s.0 & 31 == parts::LITERAL => last.1.push_str(&s.1),
            _ => out.push(s),
        }
    }
    out
}

fn rounded_is_infinite(v: &Value) -> bool {
    matches!(v, Value::Infinity(_))
}

fn text(id: u16) -> Option<&'static str> {
    let i = id as usize;
    (id != u16::MAX).then(|| &data::TEXT[data::STARTS[i] as usize..data::STARTS[i + 1] as usize])
}

/// The digits of a CLDR numeric numbering system.
pub fn digits(nu: &str) -> Option<[char; 10]> {
    let (_, d) = data::NUMBERING_SYSTEMS.iter().find(|(n, _)| *n == nu)?;
    let mut out = ['0'; 10];
    for (o, c) in out.iter_mut().zip(d.chars()) {
        *o = c;
    }
    Some(out)
}

/// The fields after `key` in the entry of `row[column]` starting with it.
fn entry(row: Row, column: usize, key: &str) -> Option<[&'static str; 3]> {
    let entry = text(row[column])?
        .split('\u{1e}')
        .find(|e| e.split('\u{1f}').next() == Some(key))?;
    let mut f = entry.split('\u{1f}').skip(1);
    Some([
        f.next().unwrap_or(""),
        f.next().unwrap_or(""),
        f.next().unwrap_or(""),
    ])
}

/// The percent sign, currency decimal and currency group of `row` for numbering system `nu`, the
/// last two empty when the plain separators apply.
fn system(row: Row, nu: &str) -> Option<[&'static str; 3]> {
    entry(row, SYSTEMS, nu)
}

/// Root's symbols for the numbering systems it has its own for (CLDR root.xml): decimal, group,
/// minus, plus, percent.
fn root_symbols(nu: &str) -> Option<[&'static str; 5]> {
    match nu {
        "arab" => Some(["٫", "٬", "\u{61c}-", "\u{61c}+", "٪\u{61c}"]),
        "arabext" => Some(["٫", "٬", "\u{200e}-\u{200e}", "\u{200e}+\u{200e}", "٪"]),
        _ => None,
    }
}

/// `base` with other separators and signs.
fn symbols_with(
    base: &DecimalSymbols,
    decimal: &str,
    group: &str,
    signs: Option<(&str, &str)>,
    min_grouping: u8,
) -> DataPayload<DecimalSymbolsV1> {
    let s = &base.strings;
    let (minus, plus) = signs.unwrap_or((s.minus_sign_prefix(), s.plus_sign_prefix()));
    let strings = DecimalSymbolStrsBuilder {
        minus_sign_prefix: VarZeroCow::new_borrowed(minus),
        minus_sign_suffix: VarZeroCow::new_borrowed(if signs.is_some() {
            ""
        } else {
            s.minus_sign_suffix()
        }),
        plus_sign_prefix: VarZeroCow::new_borrowed(plus),
        plus_sign_suffix: VarZeroCow::new_borrowed(if signs.is_some() {
            ""
        } else {
            s.plus_sign_suffix()
        }),
        decimal_separator: VarZeroCow::new_borrowed(decimal),
        grouping_separator: VarZeroCow::new_borrowed(group),
        numsys: VarZeroCow::new_borrowed(s.numsys()),
    }
    .build();
    let mut grouping_sizes = base.grouping_sizes;
    grouping_sizes.min_grouping = min_grouping;
    DataPayload::from_owned(DecimalSymbols {
        strings,
        grouping_sizes,
    })
}

/// Fixed decimal data for ICU4X's formatters: the symbols `new` resolved, and CLDR's digits for any
/// numbering system (ICU4X ships only those of its locales' defaults).
struct Fixed {
    symbols: DataPayload<DecimalSymbolsV1>,
    digits: [char; 10],
}

impl DataProvider<DecimalSymbolsV1> for Fixed {
    fn load(&self, _: DataRequest) -> Result<DataResponse<DecimalSymbolsV1>, DataError> {
        Ok(DataResponse {
            metadata: Default::default(),
            payload: self.symbols.clone(),
        })
    }
}

impl DataProvider<DecimalDigitsV1> for Fixed {
    fn load(&self, _: DataRequest) -> Result<DataResponse<DecimalDigitsV1>, DataError> {
        Ok(DataResponse {
            metadata: Default::default(),
            payload: DataPayload::from_owned(self.digits),
        })
    }
}

// Row layout (scripts/number-data.mjs): nan, exponential, approximately, range, per × 3, the
// numbering systems' symbols, the codes used as symbol and narrow symbol, the currencies with their
// own separators, then a SETS index per unit and width.
const NAN: usize = 0;
const EXPONENTIAL: usize = 1;
const APPROXIMATELY: usize = 2;
const RANGE: usize = 3;
const PER: usize = 4;
const SYSTEMS: usize = 7;
const CODE_SYMBOLS: usize = 8;
const CURRENCY_SEPARATORS: usize = 10;
const UNITS: usize = 11;
// SETS layout: zero, one, two, few, many, other, per-unit pattern, display name.
const PER_UNIT: usize = 6;

fn unit_set(row: Row, unit: usize, width: usize) -> &'static [u16; 8] {
    &data::SETS[row[UNITS + 3 * unit + width] as usize]
}

fn unit_pattern(row: Row, unit: usize, width: usize, c: PluralCategory) -> Option<&'static str> {
    let set = unit_set(row, unit, width);
    let i = plural::ALL.iter().position(|a| *a == c).unwrap_or(5);
    text(set[i]).or_else(|| text(set[5]))
}

fn load<M: DataMarker>(id: DataIdentifierBorrowed) -> Option<DataPayload<M>>
where
    Baked: DataProvider<M>,
{
    let mut metadata = DataRequestMetadata::default();
    metadata.silent = true;
    Baked
        .load(DataRequest { id, metadata })
        .ok()
        .map(|r| r.payload)
}

/// CurrencyDigits (§16.5.1): the ISO 4217 minor unit digits, 2 if unknown.
pub fn currency_digits(code: &str) -> u8 {
    let Ok(code) = CurrencyType::try_from_str(code) else {
        return 2;
    };
    load::<CurrencyFractionsV1>(Default::default())
        .map(|f| f.get().resolve(code).digits)
        .unwrap_or(2)
}

/// The plural variant for a category. The packed data is only read by operands, so this takes
/// the first small number of that category (every CLDR category has one among 0..=200 and 0.5).
fn by_category<'a, V: zerovec::ule::VarULE + ?Sized>(
    p: &'a icu::plurals::provider::PluralElementsPackedCow<'_, V>,
    rules: &icu::plurals::PluralRules,
    c: PluralCategory,
) -> &'a V {
    let samples = (0..=200u32)
        .map(Decimal::from)
        .chain(["0.5".parse().ok()].into_iter().flatten());
    let op = samples
        .map(|d| icu::plurals::PluralOperands::from(&d))
        .find(|op| rules.category_for(*op) == c)
        .unwrap_or_else(|| icu::plurals::PluralOperands::from(&Decimal::from(5)));
    p.get(op, rules)
}

// Placeholders of an interpolated pattern, found back in its output.
const ARG0: &str = "\u{f8f0}";
const ARG1: &str = "\u{f8f1}";

enum Piece {
    Text(String),
    Arg(u8),
}

fn pieces(rendered: &str) -> Vec<Piece> {
    let mut out = Vec::new();
    let mut rest = rendered;
    while let Some(at) = rest.find([ARG0.chars().next().unwrap(), ARG1.chars().next().unwrap()]) {
        if at > 0 {
            out.push(Piece::Text(rest[..at].to_owned()));
        }
        out.push(Piece::Arg(if rest[at..].starts_with(ARG0) { 0 } else { 1 }));
        rest = &rest[at + ARG0.len()..];
    }
    if !rest.is_empty() {
        out.push(Piece::Text(rest.to_owned()));
    }
    out
}

fn is_bidi(c: char) -> bool {
    matches!(c, '\u{200e}' | '\u{200f}' | '\u{61c}')
}

/// Pattern text as parts: its whitespace and bidi marks at either end literal, the rest of kind
/// `k` ("{0} km": literal " ", unit "km"), as ICU marks the fields.
fn affix(text: &str, k: u8, out: &mut Vec<Seg>) {
    let edge = |c: char| c.is_whitespace() || is_bidi(c);
    let core = text.trim_matches(edge);
    let start = text.len() - text.trim_start_matches(edge).len();
    for (kind, t) in [
        (parts::LITERAL, &text[..start]),
        (k, core),
        (parts::LITERAL, &text[start + core.len()..]),
    ] {
        if !t.is_empty() {
            out.push((kind, t.to_owned()));
        }
    }
}

/// A sign as parts: its bidi marks literal, as ICU has them ("\u{200e}-" in Arabic).
fn sign_parts(text: &str, k: u8, out: &mut Vec<Seg>) {
    let core = text.trim_matches(is_bidi);
    let start = text.len() - text.trim_start_matches(is_bidi).len();
    for (kind, t) in [
        (parts::LITERAL, &text[..start]),
        (k, core),
        (parts::LITERAL, &text[start + core.len()..]),
    ] {
        if !t.is_empty() {
            out.push((kind, t.to_owned()));
        }
    }
}

impl NumberFormat {
    /// `locale` may carry -u-nu-; `unit` is a sanctioned unit, or two joined by "-per-".
    pub fn new(locale: &str, o: NumberOptions, unit: &str) -> Option<Self> {
        let loc: Locale = locale.parse().ok()?;
        let rules = Rules::new(locale, o.digits)?;
        let dl = DataLocale::from(&loc);
        let mut base = loc.clone();
        base.extensions.unicode.clear();
        let row = row(&base.to_string());
        let silent = |id: DataIdentifierBorrowed| -> Option<DataPayload<DecimalSymbolsV1>> {
            let mut metadata = DataRequestMetadata::default();
            metadata.silent = true;
            icu::decimal::provider::Baked
                .load(DataRequest { id, metadata })
                .ok()
                .map(|r| r.payload)
        };
        let default = silent(DataIdentifierBorrowed::for_locale(&dl))?;
        let nu = loc
            .extensions
            .unicode
            .keywords
            .get(&key!("nu"))
            .map(|v| v.to_string())
            .filter(|nu| digits(nu).is_some() && nu != default.get().numsys());
        // As ICU, an explicit -u-nu- takes the locale's symbols for that system, else root's, else
        // the locale's latn ones, while its digits always apply.
        let by_system = |nu: &str| {
            silent(DataIdentifierBorrowed::for_marker_attributes_and_locale(
                DataMarkerAttributes::try_from_str(nu).ok()?,
                &dl,
            ))
        };
        let (symbols, symbols_nu) = match nu.as_deref() {
            None => (default, None),
            Some(nu) => match (by_system(nu), root_symbols(nu)) {
                (Some(s), _) => (s, Some(nu)),
                (None, Some([decimal, group, minus, plus, _])) => {
                    let g = default.get().grouping_sizes.min_grouping;
                    (
                        symbols_with(default.get(), decimal, group, Some((minus, plus)), g),
                        Some(nu),
                    )
                }
                (None, None) => (by_system("latn").unwrap_or(default), Some("latn")),
            },
        };
        let symbols_nu = symbols_nu.unwrap_or(symbols.get().numsys()).to_owned();
        let digits = digits(nu.as_deref().unwrap_or(&symbols_nu)).unwrap_or(['0'; 10]);
        let [percent, mut currency_decimal, mut currency_group] =
            system(row, &symbols_nu).unwrap_or(["", "", ""]);
        let code = core::str::from_utf8(&o.currency).ok()?;
        if let Some([d, g, _]) = entry(row, CURRENCY_SEPARATORS, code) {
            (currency_decimal, currency_group) = (d, g);
        }
        let percent = match (percent, root_symbols(&symbols_nu)) {
            ("", Some(r)) => r[4],
            ("", None) => system(row, "latn").map_or("%", |s| s[0]),
            (p, _) => p,
        };
        let currency = o.style == 2;
        let formatter = |grouping, min_grouping: Option<u8>| {
            let s = symbols.get();
            let decimal = match currency_decimal {
                d if currency && !d.is_empty() => d,
                _ => s.decimal_separator(),
            };
            let group = match currency_group {
                g if currency && !g.is_empty() => g,
                _ => s.grouping_separator(),
            };
            let min = min_grouping.unwrap_or(s.grouping_sizes.min_grouping);
            let fixed = Fixed {
                symbols: symbols_with(s, decimal, group, None, min),
                digits,
            };
            let mut d = DecimalFormatterOptions::default();
            d.grouping_strategy = Some(grouping);
            DecimalFormatter::try_new_unstable(&fixed, (&loc).into(), d).ok()
        };
        let decimal = match o.grouping {
            // ICU4X's Always keeps the locale's minimum grouping digits.
            1 => formatter(GroupingStrategy::Auto, Some(1))?,
            2 => formatter(GroupingStrategy::Min2, None)?,
            3 => formatter(GroupingStrategy::Never, None)?,
            _ => formatter(GroupingStrategy::Auto, None)?,
        };
        let plain = formatter(GroupingStrategy::Never, None)?;
        let style = match o.style {
            1 => Style::Percent {
                essentials: load(DataIdentifierBorrowed::for_locale(&dl))?,
                sign: (system(row, "latn").map_or("%", |s| s[0]), percent),
            },
            2 if o.currency_display == 3 => {
                let attrs = DataMarkerAttributes::try_from_str(code).ok()?;
                Style::CurrencyName {
                    names: load(DataIdentifierBorrowed::for_marker_attributes_and_locale(
                        attrs, &dl,
                    )),
                    patterns: load(DataIdentifierBorrowed::for_locale(&dl)),
                    code: code.to_owned(),
                }
            }
            2 => {
                let essentials = load(DataIdentifierBorrowed::for_locale(&dl))?;
                let width = match o.currency_display {
                    1 => Some(CurrencySymbolsV1::SHORT),
                    2 => Some(CurrencySymbolsV1::NARROW),
                    _ => None,
                };
                // ICU4X drops a symbol equal to the code and returns an ancestor's.
                let own_code = width.is_some_and(|w| {
                    let codes = text(row[CODE_SYMBOLS + (w == CurrencySymbolsV1::NARROW) as usize]);
                    codes
                        .unwrap_or("")
                        .as_bytes()
                        .chunks(3)
                        .any(|c| c == code.as_bytes())
                });
                let symbol = width.filter(|_| !own_code).and_then(|w| {
                    let currency = CurrencyType::try_from_str(code).ok()?;
                    let mut buf = TinyAsciiStr::EMPTY;
                    let attrs = CurrencySymbolsV1::make_attributes(currency, w, &mut buf);
                    load::<CurrencySymbolsV1>(
                        DataIdentifierBorrowed::for_marker_attributes_and_locale(attrs, &dl),
                    )
                });
                match symbol {
                    Some(s) => {
                        let s = s.get();
                        Style::Currency {
                            essentials,
                            text: s.as_str().to_owned(),
                            letters: (s.starts_with_letter(), s.ends_with_letter()),
                        }
                    }
                    None => Style::Currency {
                        essentials,
                        text: code.to_owned(),
                        letters: (true, true),
                    },
                }
            }
            3 => {
                let index = |u: &str| data::UNITS.iter().position(|x| *x == u);
                let (unit, per) = match index(unit) {
                    Some(i) => (i, None),
                    None => {
                        let (n, d) = unit.split_once("-per-")?;
                        (index(n)?, Some(index(d)?))
                    }
                };
                Style::Unit {
                    unit,
                    per,
                    width: (o.unit_display as usize).min(2),
                }
            }
            _ => Style::Decimal,
        };
        Some(Self {
            rules,
            style,
            o,
            decimal,
            plain,
            symbols,
            row,
        })
    }

    /// The sign GetNumberFormatPattern picks for the rounded value: None, minus or plus.
    fn sign(&self, negative: bool, zero: bool, nan: bool) -> Option<Sign> {
        match self.o.sign_display {
            1 => None,
            2 if nan || !negative => Some(Sign::Positive),
            2 => Some(Sign::Negative),
            3 if nan || zero => None,
            3 => Some(if negative {
                Sign::Negative
            } else {
                Sign::Positive
            }),
            4 => (negative && !zero).then_some(Sign::Negative),
            _ => negative.then_some(Sign::Negative),
        }
    }

    fn sign_affixes(&self, sign: Option<Sign>) -> [Vec<Seg>; 2] {
        let s = &self.symbols.get().strings;
        let (prefix, suffix, k) = match sign {
            Some(Sign::Negative) => (
                s.minus_sign_prefix(),
                s.minus_sign_suffix(),
                parts::MINUS_SIGN,
            ),
            Some(Sign::Positive) => (s.plus_sign_prefix(), s.plus_sign_suffix(), parts::PLUS_SIGN),
            _ => return Default::default(),
        };
        let mut out: [Vec<Seg>; 2] = Default::default();
        sign_parts(prefix, k, &mut out[0]);
        sign_parts(suffix, k, &mut out[1]);
        out
    }

    /// PartitionNumberPattern, in layers.
    fn layers(&self, v: &Value) -> Option<Layers> {
        let mut l = Layers::default();
        let (negative, zero, nan) = match v {
            Value::NaN => {
                l.inner
                    .push((parts::NAN, text(self.row[NAN]).unwrap_or("NaN").to_owned()));
                (false, false, true)
            }
            Value::Infinity(negative) => {
                l.inner.push((parts::INFINITY, "∞".to_owned()));
                (*negative, false, false)
            }
            Value::Finite(x) => {
                let mut x = x.clone();
                if matches!(self.style, Style::Percent { .. }) {
                    x.multiply_pow10(2);
                }
                let (d, exp) = self.rules.format_with_exponent(&x);
                let mut abs = d.clone();
                abs.sign = Sign::None;
                // Scaling keeps the zeros it shifted in ("025.6" for 0.256 × 100).
                abs.absolute.trim_start();
                abs.absolute.pad_start(self.o.min_integer as i16);
                let digits = parts::segments(&self.decimal.format(&abs));
                match self.o.digits.notation {
                    1 | 2 => {
                        l.inner = digits;
                        l.exponent = true;
                        l.inner.push((
                            parts::EXPONENT_SEPARATOR,
                            text(self.row[EXPONENTIAL]).unwrap_or("E").to_owned(),
                        ));
                        if exp < 0 {
                            let minus = self.symbols.get().strings.minus_sign_prefix();
                            sign_parts(minus, parts::EXPONENT_MINUS_SIGN, &mut l.inner);
                        }
                        let e =
                            parts::segments(&self.plain.format(&Decimal::from(exp.unsigned_abs())));
                        l.inner
                            .extend(e.into_iter().map(|s| (parts::EXPONENT_INTEGER, s.1)));
                    }
                    3 => {
                        // The compact pattern's text around the number, as this formatter writes it.
                        let compact = self.rules.compact()?;
                        let written = compact.format_with_exponent(&abs, exp.max(0) as u8).ok()?;
                        let segs = parts::segments(&written);
                        let first = segs
                            .iter()
                            .position(|s| s.0 != parts::LITERAL)
                            .unwrap_or(segs.len());
                        let last = segs
                            .iter()
                            .rposition(|s| s.0 != parts::LITERAL)
                            .map_or(first, |i| i + 1);
                        for s in &segs[..first] {
                            affix(&s.1, parts::COMPACT, &mut l.middle[0]);
                        }
                        // Some patterns spell the number out: French "mille" for 1000.
                        if first < segs.len() {
                            l.inner = digits;
                        }
                        for s in &segs[last..] {
                            affix(&s.1, parts::COMPACT, &mut l.middle[1]);
                        }
                    }
                    _ => l.inner = digits,
                }
                l.plural = Some(self.rules.category_of(&d, exp));
                (d.sign == Sign::Negative, d.absolute.is_zero(), false)
            }
        };
        let plural = l.plural.unwrap_or(PluralCategory::Other);
        let sign = self.sign(negative, zero, nan);
        match &self.style {
            Style::Percent {
                essentials,
                sign: (latn, percent),
            } => {
                let p = essentials.get();
                let rendered = match sign {
                    Some(_) => p
                        .signed_pattern
                        .interpolate((ARG0, ARG1))
                        .write_to_string()
                        .into_owned(),
                    None => p
                        .unsigned_pattern
                        .interpolate([ARG0])
                        .write_to_string()
                        .into_owned(),
                };
                let rendered = rendered.replace(latn, percent);
                let s = &self.symbols.get().strings;
                self.wrap_middle(&mut l, &rendered, |piece, out| match piece {
                    Piece::Text(t) => affix(t, parts::PERCENT_SIGN, out),
                    Piece::Arg(_) => {
                        let text = if sign == Some(Sign::Negative) {
                            s.minus_sign_prefix()
                        } else {
                            s.plus_sign_prefix()
                        };
                        let k = if sign == Some(Sign::Negative) {
                            parts::MINUS_SIGN
                        } else {
                            parts::PLUS_SIGN
                        };
                        sign_parts(text, k, out);
                    }
                });
            }
            Style::Currency {
                essentials,
                text: currency,
                letters,
            } => {
                let e = essentials.get();
                // Currency spacing applies next to digits only: "USDNaN", "CHF∞".
                let letters = if nan || rounded_is_infinite(v) {
                    &(false, false)
                } else {
                    letters
                };
                let negative_pattern = match sign {
                    Some(Sign::Negative) if self.o.accounting => {
                        e.get_negative_accounting(letters.0, letters.1)
                    }
                    Some(Sign::Negative) => e.get_negative(letters.0, letters.1),
                    _ => None,
                };
                let pattern = negative_pattern.unwrap_or_else(|| {
                    if self.o.accounting {
                        e.get_positive_accounting(letters.0, letters.1)
                    } else {
                        e.get_positive(letters.0, letters.1)
                    }
                });
                let rendered = pattern
                    .interpolate((ARG0, ARG1))
                    .write_to_string()
                    .into_owned();
                let minus = self.symbols.get().strings.minus_sign_prefix().to_owned();
                self.wrap_middle(&mut l, &rendered, |piece, out| match piece {
                    Piece::Arg(_) => out.push((parts::CURRENCY, currency.clone())),
                    Piece::Text(t) => match t.find(minus.as_str()).filter(|_| !minus.is_empty()) {
                        Some(at) => {
                            affix(&t[..at], parts::LITERAL, out);
                            sign_parts(&minus, parts::MINUS_SIGN, out);
                            affix(&t[at + minus.len()..], parts::LITERAL, out);
                        }
                        None => affix(t, parts::LITERAL, out),
                    },
                });
                if negative_pattern.is_none() {
                    // UTS 35: without a negative pattern, the sign goes outside the positive one.
                    let [pre, post] = self.sign_affixes(sign);
                    l.middle[0].splice(0..0, pre);
                    l.middle[1].extend(post);
                }
            }
            Style::CurrencyName { .. } | Style::Unit { .. } | Style::Decimal => {
                let [pre, post] = self.sign_affixes(sign);
                l.middle[0].splice(0..0, pre);
                l.middle[1].extend(post);
                let ([before, after], number) = self.outer(plural)?;
                // Some patterns spell the number out: Arabic "يوم" for 1 day.
                if !number {
                    l.inner.clear();
                    l.middle = Default::default();
                }
                // ICU handles the percent unit as the percent style: its sign is no outer affix.
                if matches!(self.style, Style::Unit { unit, per: None, .. } if data::UNITS[unit] == "percent")
                {
                    l.middle[0].splice(0..0, before);
                    l.middle[1].extend(after);
                } else {
                    l.outer = [before, after];
                }
            }
        }
        Some(l)
    }

    /// Splits a style pattern around its number ({0}) into the middle layer.
    fn wrap_middle(
        &self,
        l: &mut Layers,
        rendered: &str,
        mut piece: impl FnMut(&Piece, &mut Vec<Seg>),
    ) {
        let ps = pieces(rendered);
        let at = ps
            .iter()
            .position(|p| matches!(p, Piece::Arg(0)))
            .unwrap_or(ps.len());
        let mut pre = Vec::new();
        for p in &ps[..at] {
            piece(p, &mut pre);
        }
        let mut post = Vec::new();
        for p in ps.iter().skip(at + 1) {
            piece(p, &mut post);
        }
        pre.append(&mut l.middle[0]);
        l.middle[0] = pre;
        l.middle[1].append(&mut post);
    }

    /// The unit or currency-name pattern for a plural category, around the number, and whether it
    /// has the number.
    fn outer(&self, c: PluralCategory) -> Option<([Vec<Seg>; 2], bool)> {
        let mut out: [Vec<Seg>; 2] = Default::default();
        let mut number = true;
        let mut split = |rendered: &str, k: u8, arg1: Option<&str>| {
            let ps = pieces(rendered);
            number = ps.iter().any(|p| matches!(p, Piece::Arg(0)));
            let at = ps
                .iter()
                .position(|p| matches!(p, Piece::Arg(0)))
                .unwrap_or(ps.len());
            for (i, p) in ps.iter().enumerate() {
                if i == at {
                    continue;
                }
                let side = &mut out[(i > at) as usize];
                match p {
                    Piece::Text(t) => affix(t, k, side),
                    Piece::Arg(_) => {
                        side.push((parts::CURRENCY, arg1.unwrap_or_default().to_owned()))
                    }
                }
            }
        };
        match &self.style {
            Style::CurrencyName {
                names,
                patterns,
                code,
            } => {
                let rules = self.rules.cardinal();
                let name = names
                    .as_ref()
                    .map_or(code.as_str(), |n| by_category(n.get(), rules, c));
                let rendered = match patterns {
                    Some(p) => by_category(p.get(), rules, c)
                        .interpolate((ARG0, ARG1))
                        .write_to_string()
                        .into_owned(),
                    None => format!("{ARG0} {ARG1}"),
                };
                split(&rendered, parts::LITERAL, Some(name));
            }
            Style::Unit { unit, per, width } => {
                let numerator = unit_pattern(self.row, *unit, *width, c)?;
                let rendered = match per {
                    None => numerator.replace("{0}", ARG0),
                    Some(per) => {
                        let set = unit_set(self.row, *per, *width);
                        match text(set[PER_UNIT]) {
                            Some(p) => p.replace("{0}", &numerator.replace("{0}", ARG0)),
                            None => {
                                // The compound pattern with the denominator's singular name.
                                let compound = text(self.row[PER + width]).unwrap_or("{0}/{1}");
                                let one = unit_pattern(self.row, *per, *width, PluralCategory::One)
                                    .unwrap_or("{0}");
                                let name = one.replace("{0}", "");
                                compound
                                    .replace("{0}", &numerator.replace("{0}", ARG0))
                                    .replace("{1}", name.trim())
                            }
                        }
                    }
                };
                split(&rendered, parts::UNIT, None);
            }
            _ => {}
        }
        Some((out, number))
    }

    /// FormatNumericToParts.
    pub fn format(&self, v: &Value) -> Option<Vec<Seg>> {
        Some(merge_literals(self.layers(v)?.flat()))
    }

    /// PartitionNumberRangePattern, with ICU's collapsing of identical affixes.
    pub fn format_range(&self, x: &Value, y: &Value) -> Option<Vec<Seg>> {
        let a = self.layers(x)?;
        let b = self.layers(y)?;
        let joined = |segs: &[Seg]| segs.iter().map(|s| s.1.as_str()).collect::<String>();
        if joined(&a.flat()) == joined(&b.flat()) {
            return Some(self.approximately(a.flat()));
        }
        let shared = |segs: &[Seg], out: &mut Vec<Seg>| {
            out.extend(segs.iter().map(|s| (s.0 | parts::SHARED, s.1.clone())))
        };
        // Outer patterns collapse, in the range's plural form; a middle affix only when it is
        // the same on both sides and longer than one code point (ICU's UNUM_RANGE_COLLAPSE_AUTO).
        let mut outer = a.outer.clone();
        if !a.outer[0].is_empty() || !a.outer[1].is_empty() {
            let c = match (x, y) {
                (Value::Finite(p), Value::Finite(q)) => {
                    self.rules.select_range(Some(p.clone()), Some(q.clone()))
                }
                _ => PluralCategory::Other,
            };
            outer = self.outer(c)?.0;
        }
        let middle_len: usize = a.middle.iter().flatten().map(|s| s.1.chars().count()).sum();
        let collapse_middle = a.middle == b.middle && middle_len > 1;
        let repeat = (!collapse_middle && middle_len > 0) || a.exponent;
        let mut out = Vec::new();
        shared(&outer[0], &mut out);
        if collapse_middle {
            shared(&a.middle[0], &mut out);
        }
        for (side, l) in [(parts::START_RANGE, &a), (parts::END_RANGE, &b)] {
            if side == parts::END_RANGE {
                let range = text(self.row[RANGE]).unwrap_or("{0}–{1}");
                let sep = range
                    .split_once("{0}")
                    .and_then(|(_, r)| r.split_once("{1}"))
                    .map_or("–", |(s, _)| s);
                let mut sep = sep.to_owned();
                if repeat {
                    if !sep.starts_with(char::is_whitespace) {
                        sep.insert(0, ' ');
                    }
                    if !sep.ends_with(char::is_whitespace) {
                        sep.push(' ');
                    }
                }
                out.push((parts::LITERAL | parts::SHARED, sep));
            }
            let mut segs = Vec::new();
            if !collapse_middle {
                segs.extend_from_slice(&l.middle[0]);
            }
            segs.extend_from_slice(&l.inner);
            if !collapse_middle {
                segs.extend_from_slice(&l.middle[1]);
            }
            out.extend(segs.into_iter().map(|s| (s.0 | side, s.1)));
        }
        if collapse_middle {
            shared(&a.middle[1], &mut out);
        }
        shared(&outer[1], &mut out);
        Some(merge_literals(out))
    }

    /// FormatApproximately: the locale's approximately pattern around the number, all shared.
    fn approximately(&self, segs: Vec<Seg>) -> Vec<Seg> {
        let pattern = text(self.row[APPROXIMATELY]).unwrap_or("~{0}");
        let (pre, post) = pattern.split_once("{0}").unwrap_or(("~", ""));
        let mut out = Vec::new();
        affix(pre, parts::APPROXIMATELY_SIGN, &mut out);
        out.extend(segs);
        affix(post, parts::APPROXIMATELY_SIGN, &mut out);
        merge_literals(
            out.into_iter()
                .map(|s| (s.0 | parts::SHARED, s.1))
                .collect(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts() -> NumberOptions {
        NumberOptions {
            digits: Options {
                ordinal: false,
                notation: 0,
                compact_long: false,
                min_fraction: 0,
                max_fraction: 3,
                min_significant: 1,
                max_significant: 21,
                rounding_type: 0,
                rounding_increment: 1,
                rounding_mode: 6,
                strip_if_integer: false,
            },
            style: 0,
            currency: *b"USD",
            currency_display: 1,
            accounting: false,
            unit_display: 1,
            grouping: 0,
            sign_display: 0,
            min_integer: 1,
        }
    }

    fn currency(o: NumberOptions, code: &[u8; 3]) -> NumberOptions {
        let d = currency_digits(core::str::from_utf8(code).unwrap());
        NumberOptions {
            style: 2,
            currency: *code,
            digits: Options {
                min_fraction: d,
                max_fraction: d,
                ..o.digits
            },
            ..o
        }
    }

    fn v(s: &str) -> Value {
        Value::Finite(plural::from_str(s).unwrap())
    }

    fn text(segs: Vec<Seg>) -> String {
        segs.into_iter().map(|s| s.1).collect()
    }

    fn fmt(locale: &str, o: NumberOptions, unit: &str, x: &str) -> String {
        text(
            NumberFormat::new(locale, o, unit)
                .unwrap()
                .format(&v(x))
                .unwrap(),
        )
    }

    fn range(locale: &str, o: NumberOptions, unit: &str, x: &str, y: &str) -> String {
        text(
            NumberFormat::new(locale, o, unit)
                .unwrap()
                .format_range(&v(x), &v(y))
                .unwrap(),
        )
    }

    #[test]
    fn formats() {
        let o = opts();
        assert_eq!(fmt("en", o, "", "-1234567.891"), "-1,234,567.891");
        assert_eq!(
            fmt("fr", o, "", "1234567.891"),
            "1\u{202f}234\u{202f}567,891"
        );
        assert_eq!(
            fmt(
                "en",
                NumberOptions {
                    sign_display: 2,
                    ..o
                },
                "",
                "5"
            ),
            "+5"
        );
        assert_eq!(fmt("en", o, "", "-0"), "-0");
        assert_eq!(
            fmt(
                "en",
                NumberOptions {
                    sign_display: 3,
                    ..o
                },
                "",
                "-0"
            ),
            "0"
        );
        assert_eq!(fmt("en", currency(o, b"USD"), "", "-1234.5"), "-$1,234.50");
        assert_eq!(
            fmt("fr", currency(o, b"EUR"), "", "1234.5"),
            "1\u{202f}234,50\u{a0}€"
        );
        assert_eq!(
            fmt(
                "en",
                NumberOptions {
                    accounting: true,
                    ..currency(o, b"USD")
                },
                "",
                "-5"
            ),
            "($5.00)"
        );
        assert_eq!(fmt("en", currency(o, b"CHF"), "", "5"), "CHF\u{a0}5.00");
        assert_eq!(
            fmt(
                "en",
                NumberOptions {
                    currency_display: 3,
                    ..currency(o, b"USD")
                },
                "",
                "2"
            ),
            "2.00 US dollars"
        );
        assert_eq!(fmt("ja", currency(o, b"JPY"), "", "1234"), "￥1,234");
        let percent = NumberOptions {
            style: 1,
            digits: Options {
                max_fraction: 0,
                ..o.digits
            },
            ..o
        };
        assert_eq!(fmt("en", percent, "", "0.256"), "26%");
        assert_eq!(fmt("tr", percent, "", "-0.05"), "-%5");
        let compact = NumberOptions {
            digits: Options {
                notation: 3,
                rounding_type: 2,
                max_fraction: 0,
                max_significant: 2,
                ..o.digits
            },
            grouping: 2,
            ..o
        };
        assert_eq!(fmt("en", compact, "", "12345"), "12K");
        assert_eq!(
            fmt(
                "en",
                NumberOptions {
                    digits: Options {
                        compact_long: true,
                        ..compact.digits
                    },
                    ..compact
                },
                "",
                "1234567"
            ),
            "1.2 million"
        );
        // Compact notation keeps its own digits, not the currency's (SetNumberFormatDigitOptions).
        assert_eq!(
            fmt(
                "de",
                NumberOptions {
                    style: 2,
                    currency: *b"EUR",
                    ..compact
                },
                "",
                "1234567"
            ),
            "1,2\u{a0}Mio.\u{a0}€"
        );
        let sci = NumberOptions {
            digits: Options {
                notation: 1,
                ..o.digits
            },
            ..o
        };
        assert_eq!(fmt("en", sci, "", "12345"), "1.235E4");
        assert_eq!(fmt("en", sci, "", "-0.00012"), "-1.2E-4");
        let unit = NumberOptions { style: 3, ..o };
        assert_eq!(fmt("en", unit, "kilometer-per-hour", "50"), "50 km/h");
        assert_eq!(fmt("en", unit, "kilobyte-per-second", "5"), "5 kB/s");
        assert_eq!(
            fmt(
                "en",
                NumberOptions {
                    unit_display: 0,
                    ..unit
                },
                "kilobyte-per-second",
                "5"
            ),
            "5 kilobytes per second"
        );
        assert_eq!(
            fmt(
                "en",
                NumberOptions {
                    unit_display: 0,
                    ..unit
                },
                "gallon-per-hour",
                "1"
            ),
            "1 gallon per hour"
        );
        assert_eq!(fmt("en", unit, "percent", "5"), "5%");
        assert_eq!(fmt("en-u-nu-arab", o, "", "12"), "١٢");
        assert_eq!(
            fmt("en", NumberOptions { grouping: 3, ..o }, "", "12345"),
            "12345"
        );
        assert_eq!(fmt("es", o, "", "1234"), "1234");
        assert_eq!(
            fmt("es", NumberOptions { grouping: 1, ..o }, "", "1234"),
            "1.234"
        );
    }

    #[test]
    fn as_icu() {
        let o = opts();
        let long = |unit_display| NumberOptions {
            style: 3,
            unit_display,
            ..o
        };
        // Patterns without the number.
        assert_eq!(fmt("ar", long(0), "day", "1"), "يوم");
        assert_eq!(fmt("ar", long(0), "day", "-2"), "يومان");
        // Locales without currency names, symbols equal to the code, currency separators.
        let name = NumberOptions {
            currency_display: 3,
            ..currency(o, b"JPY")
        };
        assert_eq!(fmt("bgc", name, "", "1"), "१ JPY");
        assert_eq!(fmt("it", currency(o, b"USD"), "", "1"), "1,00\u{a0}USD");
        assert_eq!(fmt("de-CH", currency(o, b"EUR"), "", "1"), "EUR\u{a0}1.00");
        assert_eq!(
            fmt("de-AT", currency(o, b"EUR"), "", "1234.5"),
            "€\u{a0}1.234,50"
        );
        assert_eq!(
            fmt("fr-CH", currency(o, b"EUR"), "", "1234.5"),
            "1'234.50\u{a0}€"
        );
        assert_eq!(
            fmt("pt-CV", currency(o, b"CVE"), "", "1234.5"),
            "1234$50\u{a0}\u{200b}"
        );
        // Numbering systems: the locale's percent sign, any system's digits, root's arab symbols.
        let percent = NumberOptions {
            style: 1,
            digits: Options {
                max_fraction: 0,
                ..o.digits
            },
            ..o
        };
        assert_eq!(fmt("fa", percent, "", "0.5"), "۵۰٪");
        assert_eq!(fmt("ar-EG", percent, "", "-0.5"), "\u{61c}-٥٠٪\u{61c}");
        assert_eq!(fmt("en-u-nu-fullwide", o, "", "1234.5"), "１,２３４.５");
        assert_eq!(fmt("de-u-nu-arab", o, "", "-1234.5"), "\u{61c}-١٬٢٣٤٫٥");
        assert_eq!(fmt("ar-EG-u-nu-thai", o, "", "1234.5"), "๑,๒๓๔.๕");
        // Compact patterns chosen with the language's plural rules.
        let compact_long = NumberOptions {
            digits: Options {
                notation: 3,
                compact_long: true,
                rounding_type: 2,
                max_fraction: 0,
                max_significant: 2,
                ..o.digits
            },
            grouping: 2,
            ..o
        };
        assert_eq!(fmt("sr-Latn", compact_long, "", "1234"), "1,2 hiljade");
    }

    #[test]
    fn ranges() {
        let o = opts();
        assert_eq!(range("en", o, "", "3", "5"), "3–5");
        assert_eq!(range("en", o, "", "3", "3"), "~3");
        assert_eq!(
            range("en", currency(o, b"USD"), "", "3", "5"),
            "$3.00 – $5.00"
        );
        assert_eq!(range("en", currency(o, b"USD"), "", "3", "3.001"), "~$3.00");
        assert_eq!(
            range("fr", currency(o, b"EUR"), "", "3", "5"),
            "3,00–5,00\u{a0}€"
        );
        assert_eq!(
            range(
                "en",
                NumberOptions {
                    currency_display: 0,
                    ..currency(o, b"USD")
                },
                "",
                "1",
                "5"
            ),
            "USD\u{a0}1.00–5.00"
        );
        assert_eq!(
            range("en", NumberOptions { style: 3, ..o }, "kilometer", "3", "5"),
            "3–5 km"
        );
        assert_eq!(
            range(
                "en",
                NumberOptions {
                    style: 3,
                    unit_display: 0,
                    ..o
                },
                "kilometer",
                "1",
                "5"
            ),
            "1–5 kilometers"
        );
        assert_eq!(
            range(
                "en",
                NumberOptions {
                    style: 1,
                    digits: Options {
                        max_fraction: 0,
                        ..o.digits
                    },
                    ..o
                },
                "",
                "0.03",
                "0.05"
            ),
            "3% – 5%"
        );
        assert_eq!(range("en", o, "", "-5", "-3"), "-5 – -3");
        assert_eq!(range("en", o, "", "-3", "-3.0001"), "~-3");
        assert_eq!(
            range(
                "en",
                NumberOptions {
                    sign_display: 2,
                    ..o
                },
                "",
                "3",
                "5"
            ),
            "+3 – +5"
        );
        assert_eq!(range("ja", o, "", "3", "5"), "3～5");
        assert_eq!(
            range("en", NumberOptions { style: 3, ..o }, "percent", "3", "5"),
            "3% – 5%"
        );
        let compact = NumberOptions {
            digits: Options {
                notation: 3,
                rounding_type: 2,
                max_fraction: 0,
                max_significant: 2,
                ..o.digits
            },
            grouping: 2,
            ..o
        };
        assert_eq!(range("en", compact, "", "1000", "5000"), "1K – 5K");
        assert_eq!(
            range(
                "en",
                NumberOptions {
                    digits: Options {
                        compact_long: true,
                        ..compact.digits
                    },
                    ..compact
                },
                "",
                "1000",
                "5000"
            ),
            "1–5 thousand"
        );
        assert_eq!(
            range(
                "en",
                NumberOptions {
                    digits: Options {
                        notation: 1,
                        ..o.digits
                    },
                    ..o
                },
                "",
                "1000",
                "5000"
            ),
            "1E3 – 5E3"
        );
    }
}
