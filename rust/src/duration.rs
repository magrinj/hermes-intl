//! Intl.DurationFormat core (§13.5): PartitionDurationFormatPattern on resolved options, in exact
//! decimal arithmetic. Options are resolved and durations validated in JS (js/bootstrap.js).

use crate::parts;
use fixed_decimal::{Decimal, SignDisplay};
use icu::decimal::options::{DecimalFormatterOptions, GroupingStrategy};
use icu::decimal::DecimalFormatter;
use icu::list::options::{ListFormatterOptions, ListLength};
use icu::list::ListFormatter;
use icu::locale::Locale;
use icu_experimental::dimension::units::categorized_formatter::CategorizedFormatter;
use icu_experimental::dimension::units::options::{UnitsFormatterOptions, Width};
use icu_experimental::duration::provider::DigitalDurationDataV1;
use icu_experimental::measure::category::Duration as DurationCategory;
use icu_provider::prelude::*;
use std::sync::OnceLock;
use writeable::{Part, PartsWrite, Writeable};

// Unit styles, shared with js/bootstrap.js.
pub const LONG: u8 = 0;
pub const SHORT: u8 = 1;
pub const NARROW: u8 = 2;
pub const NUMERIC: u8 = 3;
pub const TWO_DIGIT: u8 = 4;
pub const FRACTIONAL: u8 = 5;

const HOURS: usize = 4;
const MINUTES: usize = 5;
const SECONDS: usize = 6;

type Formatter = CategorizedFormatter<DurationCategory>;

pub struct DurationFormat {
    locale: Locale,
    data: crate::plural::Data,
    /// Per unit, years to nanoseconds.
    styles: [u8; 10],
    always: [bool; 10],
    fractional_digits: Option<u8>,
    list: ListFormatter,
    units: [OnceLock<Option<Formatter>>; 10],
    digits: OnceLock<Option<DecimalFormatter>>,
    separator: String,
    // Root's group, decimal and minus sign, for an explicit -u-nu-arab or arabext the locale has
    // no symbols for (CLDR; ICU4X keeps the locale's own). Only those two differ from Latin.
    root_symbols: Root,
}

type Root = Option<[&'static str; 3]>;

/// Whether the locale pads hours to two digits in digital style ([[TwoDigitHours]]).
pub fn two_digit_hours(locale: &str) -> bool {
    digital(locale).is_some_and(|d| d.get().hms_padding.h == 2)
}

fn digital(locale: &str) -> Option<DataPayload<DigitalDurationDataV1>> {
    let loc: Locale = locale.parse().ok()?;
    icu_experimental::provider::Baked
        .load(DataRequest {
            id: DataIdentifierBorrowed::for_locale(&DataLocale::from(&loc)),
            ..Default::default()
        })
        .ok()
        .map(|r| r.payload)
}

impl DurationFormat {
    /// `locale` may carry -u-nu-; `base` 0 long, 1 short, 2 narrow, 3 digital; `always` has bit i
    /// for unit i's display "always"; `fractional_digits` 0..=9, or None.
    pub fn new(
        locale: &str,
        base: u8,
        styles: [u8; 10],
        always: u16,
        fractional_digits: Option<u8>,
    ) -> Option<Self> {
        let loc: Locale = locale.parse().ok()?;
        // ListFormatParts: the base style, short for digital.
        let length = [
            ListLength::Wide,
            ListLength::Short,
            ListLength::Narrow,
            ListLength::Short,
        ][(base as usize).min(3)];
        let list = ListFormatter::try_new_unit(
            (&loc).into(),
            ListFormatterOptions::default().with_length(length),
        )
        .ok()?;
        let nu = loc
            .extensions
            .unicode
            .keywords
            .get(&icu::locale::extensions::unicode::key!("nu"))
            .map(|v| v.to_string());
        let mut base_locale = loc.clone();
        base_locale.extensions.unicode.clear();
        let default_nu = crate::locale::default_numbering_system(&base_locale.to_string());
        let root_symbols = match nu.as_deref() {
            Some("arab") if default_nu != "arab" => Some(["٬", "٫", "\u{61c}-"]),
            Some("arabext") if default_nu != "arabext" => Some(["٬", "٫", "\u{200e}-\u{200e}"]),
            _ => None,
        };
        Some(Self {
            root_symbols,
            separator: digital(locale)
                .map(|d| d.get().separator.to_string())
                .unwrap_or_else(|| ":".into()),
            data: crate::plural::Data::new(&loc),
            locale: loc,
            styles,
            always: core::array::from_fn(|i| always & 1 << i != 0),
            fractional_digits,
            list,
            units: Default::default(),
            digits: OnceLock::new(),
        })
    }

    fn unit(&self, i: usize) -> Option<&Formatter> {
        self.units[i]
            .get_or_init(|| {
                let unit = match i {
                    0 => DurationCategory::year(),
                    1 => DurationCategory::month(),
                    2 => DurationCategory::week(),
                    3 => DurationCategory::day(),
                    4 => DurationCategory::hour(),
                    5 => DurationCategory::minute(),
                    6 => DurationCategory::second(),
                    7 => DurationCategory::millisecond(),
                    8 => DurationCategory::microsecond(),
                    _ => DurationCategory::nanosecond(),
                };
                let width =
                    [Width::Long, Width::Short, Width::Narrow][(self.styles[i] as usize).min(2)];
                Formatter::try_new_outlier_unstable(
                    &self.data,
                    (&self.locale).into(),
                    unit,
                    UnitsFormatterOptions::from(width),
                )
                .ok()
            })
            .as_ref()
    }

    // NumberFormat with useGrouping false, for the digital fields.
    fn digits(&self) -> Option<&DecimalFormatter> {
        self.digits
            .get_or_init(|| {
                let mut o = DecimalFormatterOptions::default();
                o.grouping_strategy = Some(GroupingStrategy::Never);
                DecimalFormatter::try_new_unstable(&self.data, (&self.locale).into(), o).ok()
            })
            .as_ref()
    }

    /// ComputeFractionalDigits added to `value`: exact, as an integer scaled by 10^exponent.
    fn with_fractions(&self, value: i128, d: &[i128; 10], next: usize) -> (i128, i16) {
        let (mut scaled, mut exponent) = (value, 0);
        for (style, v) in self.styles[next..].iter().zip(&d[next..]) {
            if *style == FRACTIONAL {
                scaled = scaled * 1000 + v;
                exponent += 3;
            }
        }
        (scaled, exponent)
    }

    /// The rounding of seconds and fractional units: trunc at `fractionalDigits`, else at 9 digits.
    fn fraction(&self, scaled: i128, exponent: i16) -> Decimal {
        let mut v = Decimal::from(scaled);
        v.absolute.multiply_pow10(-exponent);
        let (min, max) = match self.fractional_digits {
            Some(f) => (f as i16, f as i16),
            None => (0, 9),
        };
        v.trunc(-max);
        v.absolute.trim_end();
        v.absolute.pad_end(-min);
        v
    }

    /// PartitionDurationFormatPattern. `d` holds the duration's fields, valid and integral.
    pub fn segments(&self, d: [f64; 10]) -> Option<Vec<(u16, String)>> {
        let d: [i128; 10] = d.map(|v| v as i128);
        let negative = d.iter().any(|v| *v < 0);
        let mut elements: Vec<Vec<(u16, String)>> = Vec::new();
        let mut sign_displayed = true;
        for i in 0..10 {
            let style = self.styles[i];
            if style == NUMERIC || style == TWO_DIGIT {
                elements.push(self.numeric_units(&d, i, negative, &mut sign_displayed)?);
                break;
            }
            let mut value = Decimal::from(d[i]);
            let mut last = false;
            // Seconds, milliseconds or microseconds followed by a fractional unit.
            if (SECONDS..9).contains(&i) && self.styles[i + 1] == FRACTIONAL {
                let (scaled, exponent) = self.with_fractions(d[i], &d, i + 1);
                value = self.fraction(scaled, exponent);
                last = true;
            }
            if !is_zero(&value) || self.always[i] {
                sign(&mut value, &mut sign_displayed, negative);
                let mut segs = Vec::new();
                unit_parts(
                    &self.unit(i)?.format_fixed_decimal(&value),
                    i,
                    self.root_symbols,
                    &mut segs,
                );
                elements.push(segs);
            }
            if last {
                break;
            }
        }
        Some(self.list_parts(elements))
    }

    /// FormatNumericUnits from `first` (hours, minutes or seconds).
    fn numeric_units(
        &self,
        d: &[i128; 10],
        first: usize,
        negative: bool,
        sign_displayed: &mut bool,
    ) -> Option<Vec<(u16, String)>> {
        let (scaled, exponent) = self.with_fractions(d[SECONDS], d, SECONDS + 1);
        let seconds = self.fraction(scaled, exponent);
        let hours_formatted = first == HOURS && (d[HOURS] != 0 || self.always[HOURS]);
        let seconds_formatted = scaled != 0 || self.always[SECONDS];
        let minutes_formatted = first <= MINUTES
            && (hours_formatted && seconds_formatted || d[MINUTES] != 0 || self.always[MINUTES]);
        let mut out = Vec::new();
        let fields = [
            (HOURS, hours_formatted, Decimal::from(d[HOURS])),
            (MINUTES, minutes_formatted, Decimal::from(d[MINUTES])),
            (SECONDS, seconds_formatted, seconds),
        ];
        let mut previous = false;
        for (unit, formatted, mut value) in fields {
            if !formatted {
                continue;
            }
            if previous {
                out.push((parts::LITERAL.into(), self.separator.clone()));
            }
            if self.styles[unit] == TWO_DIGIT {
                value.absolute.pad_start(2);
            }
            sign(&mut value, sign_displayed, negative);
            number_parts(
                parts::segments(&self.digits()?.format(&value)),
                unit,
                self.root_symbols,
                &mut out,
            );
            previous = true;
        }
        Some(out)
    }

    /// ListFormatParts: the list's literals around each element's own parts.
    fn list_parts(&self, elements: Vec<Vec<(u16, String)>>) -> Vec<(u16, String)> {
        let texts: Vec<String> = elements
            .iter()
            .map(|e| e.iter().map(|s| s.1.as_str()).collect())
            .collect();
        // Elements one by one: parts::segments would merge adjacent ones, as in "1小时2分钟".
        let mut sink = ListSink::default();
        let _ = self.list.format(texts.iter()).write_to_parts(&mut sink);
        let mut elements = elements.into_iter();
        let mut out = Vec::new();
        for item in sink.items {
            match item {
                Some(literal) => out.push((parts::LITERAL.into(), literal)),
                None => out.extend(elements.next().unwrap_or_default()),
            }
        }
        out
    }
}

/// IsValidDuration, exactly: one sign, years to weeks under 2^32, and the days to nanoseconds
/// under 2^53 seconds in all.
pub fn is_valid(d: [f64; 10]) -> bool {
    let mut sign = 0;
    for v in d {
        if !v.is_finite() || v < 0.0 && sign > 0 || v > 0.0 && sign < 0 {
            return false;
        }
        if v != 0.0 {
            sign = if v < 0.0 { -1 } else { 1 };
        }
    }
    if d[..3].iter().any(|v| v.abs() >= 4294967296.0) {
        return false;
    }
    // Nanoseconds per day, hour, minute, second, millisecond, microsecond and nanosecond.
    const NS: [i128; 7] = [
        86_400_000_000_000,
        3_600_000_000_000,
        60_000_000_000,
        1_000_000_000,
        1_000_000,
        1_000,
        1,
    ];
    let mut total: i128 = 0;
    for (v, ns) in d[3..].iter().zip(NS) {
        // Past 2^100 the cast would saturate; such a value is out of range whatever its unit.
        if v.abs() >= 1.2676506002282294e30 {
            return false;
        }
        match (*v as i128)
            .checked_mul(ns)
            .and_then(|x| total.checked_add(x))
        {
            Some(t) => total = t,
            None => return false,
        }
    }
    total.unsigned_abs() < (1u128 << 53) * 1_000_000_000
}

/// A formatted list as literals (Some) and element slots (None).
#[derive(Default)]
struct ListSink {
    items: Vec<Option<String>>,
    in_element: bool,
}

impl core::fmt::Write for ListSink {
    fn write_str(&mut self, s: &str) -> core::fmt::Result {
        if !self.in_element && !s.is_empty() {
            match self.items.last_mut() {
                Some(Some(literal)) => literal.push_str(s),
                _ => self.items.push(Some(s.to_owned())),
            }
        }
        Ok(())
    }
}

impl PartsWrite for ListSink {
    type SubPartsWrite = Self;
    fn with_part(
        &mut self,
        part: Part,
        mut f: impl FnMut(&mut Self) -> core::fmt::Result,
    ) -> core::fmt::Result {
        if part != icu::list::parts::ELEMENT {
            return f(self);
        }
        self.items.push(None);
        self.in_element = true;
        let r = f(self);
        self.in_element = false;
        r
    }
}

fn is_zero(v: &Decimal) -> bool {
    v.absolute.is_zero()
}

/// The sign rule of PartitionDurationFormatPattern and FormatNumericUnits: only the first value
/// shown has a sign, and a zero there is negative-zero when the duration is negative.
fn sign(value: &mut Decimal, sign_displayed: &mut bool, negative: bool) {
    if *sign_displayed {
        *sign_displayed = false;
        if negative {
            value.set_sign(fixed_decimal::Sign::Negative);
        }
    } else {
        value.apply_sign_display(SignDisplay::Never);
    }
}

/// Bits 7 and up of a part's kind carry its unit (1 years ..= 10 nanoseconds), above the kind and
/// the range source (parts.rs).
fn unit_bits(unit: usize) -> u16 {
    (unit as u16 + 1) << 7
}

/// A number's parts, tagged with their unit. As in ICU, the bidi marks of a minus sign ("\u{200e}-"
/// in Arabic) are a literal of their own.
fn number_parts(segs: Vec<(u8, String)>, unit: usize, root: Root, out: &mut Vec<(u16, String)>) {
    let bits = unit_bits(unit);
    for (kind, mut text) in segs {
        if let Some([group, decimal, minus]) = root {
            match kind {
                parts::GROUP => text = group.into(),
                parts::DECIMAL => text = decimal.into(),
                parts::MINUS_SIGN => text = minus.into(),
                _ => {}
            }
        }
        if kind != parts::MINUS_SIGN {
            out.push((u16::from(kind) | bits, text));
            continue;
        }
        let bidi = |c: char| matches!(c, '\u{200e}' | '\u{200f}' | '\u{61c}');
        let sign = text.trim_matches(bidi);
        let start = text.len() - text.trim_start_matches(bidi).len();
        for (k, t) in [
            (parts::LITERAL, &text[..start]),
            (parts::MINUS_SIGN, sign),
            (parts::LITERAL, &text[start + sign.len()..]),
        ] {
            if !t.is_empty() {
                out.push((u16::from(k) | bits, t.to_owned()));
            }
        }
    }
}

/// A formatted unit's parts: the number's, then the pattern's text as the unit, less the
/// whitespace around it ("{0} hr": literal " ", unit "hr"), as ICU marks the unit field.
fn unit_parts(w: &impl Writeable, unit: usize, root: Root, out: &mut Vec<(u16, String)>) {
    let bits = unit_bits(unit);
    for (kind, text) in parts::segments(w) {
        if kind != parts::LITERAL {
            number_parts(vec![(kind, text)], unit, root, out);
            continue;
        }
        let core = text.trim();
        let start = text.len() - text.trim_start().len();
        let end = start + core.len();
        for (k, t) in [
            (parts::LITERAL, &text[..start]),
            (parts::UNIT, core),
            (parts::LITERAL, &text[end..]),
        ] {
            if !t.is_empty() {
                out.push((u16::from(k) | bits, t.to_owned()));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fmt(locale: &str, base: u8, styles: [u8; 10], always: u16, d: [f64; 10]) -> String {
        DurationFormat::new(locale, base, styles, always, None)
            .unwrap()
            .segments(d)
            .unwrap()
            .into_iter()
            .map(|s| s.1)
            .collect()
    }

    const SHORT_ALL: [u8; 10] = [
        SHORT, SHORT, SHORT, SHORT, SHORT, SHORT, SHORT, SHORT, SHORT, SHORT,
    ];
    const DIGITAL: [u8; 10] = [
        SHORT, SHORT, SHORT, SHORT, NUMERIC, TWO_DIGIT, TWO_DIGIT, FRACTIONAL, FRACTIONAL,
        FRACTIONAL,
    ];

    #[test]
    fn validity() {
        let mut d = [0.0; 10];
        d[6] = 9007199254740991.0;
        assert!(is_valid(d));
        d[6] = 9007199254740992.0;
        assert!(!is_valid(d));
        assert!(!is_valid([1., -1., 0., 0., 0., 0., 0., 0., 0., 0.]));
        assert!(!is_valid([4294967296., 0., 0., 0., 0., 0., 0., 0., 0., 0.]));
        assert!(!is_valid([0., 0., 0., 0., 0., 0., 0., 0., 0., 1e300]));
        assert!(is_valid([
            0.,
            0.,
            0.,
            0.,
            0.,
            0.,
            0.,
            4503599627370497000.,
            4503599627370495000000.,
            0.
        ]));
    }

    #[test]
    fn formats() {
        let d = [0., 0., 0., 0., 1., 2., 3., 40., 0., 0.];
        assert_eq!(
            fmt("en", SHORT, SHORT_ALL, 0, d),
            "1 hr, 2 min, 3 sec, 40 ms"
        );
        assert_eq!(fmt("en", 3, DIGITAL, 0b111 << 4, d), "1:02:03.04");
        let big = [0., 0., 0., 0., 12345., 2., 3., 5., 0., 0.];
        assert_eq!(fmt("en", 3, DIGITAL, 0b111 << 4, big), "12345:02:03.005");
        assert_eq!(fmt("fi", 3, DIGITAL, 0b111 << 4, d), "1.02.03,04");
        // Digits ICU4X does not ship (rust/src/number_data.rs).
        assert_eq!(
            fmt("en-u-nu-fullwide", SHORT, SHORT_ALL, 0, d),
            "１ hr, ２ min, ３ sec, ４０ ms"
        );
        assert_eq!(
            fmt("en-u-nu-fullwide", 3, DIGITAL, 0b111 << 4, d),
            "１:０２:０３.０４"
        );
        assert_eq!(fmt("zh", SHORT, SHORT_ALL, 0, d), "1小时2分钟3秒40毫秒");
        let zh = DurationFormat::new("zh", SHORT, SHORT_ALL, 0, None)
            .unwrap()
            .segments(d)
            .unwrap();
        assert!(zh.iter().all(|s| !s.1.is_empty()));
        let neg = [0., 0., 0., 0., -1., -2., 0., 0., 0., 0.];
        assert_eq!(fmt("en", NARROW, [NARROW; 10], 0, neg), "-1h 2m");
        // Exact: 9007199254740991 ns is past f64's precision once divided.
        let exact = [0., 0., 0., 0., 0., 0., 1., 2., 3., 9007199254740991.];
        assert_eq!(
            fmt("en", 3, DIGITAL, 0b111 << 4, exact),
            "0:00:9007200.256743991"
        );
        let parts = DurationFormat::new("en", SHORT, SHORT_ALL, 0, None)
            .unwrap()
            .segments([0., 0., 0., 0., 3., 0., 0., 0., 0., 0.])
            .unwrap();
        assert_eq!(
            parts,
            [
                (u16::from(parts::INTEGER) | unit_bits(HOURS), "3".into()),
                (u16::from(parts::LITERAL) | unit_bits(HOURS), " ".into()),
                (u16::from(parts::UNIT) | unit_bits(HOURS), "hr".into())
            ]
        );
    }
}
