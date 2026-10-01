//! Intl.RelativeTimeFormat core (§18.5). Formatters are built per (unit, numeric mode) on first use:
//! each carries plural rules + decimal symbols, so eight up front would cost eight data loads.

use crate::parts;
use fixed_decimal::{Decimal, UnsignedRoundingMode};
use icu::decimal::DecimalFormatter;
use icu::locale::Locale;
use icu_experimental::relativetime::options::Numeric;
use icu_experimental::relativetime::{RelativeTimeFormatter as F, RelativeTimeFormatterOptions};
use std::sync::OnceLock;

type Ctor = fn(
    icu_experimental::relativetime::RelativeTimeFormatterPreferences,
    RelativeTimeFormatterOptions,
) -> Result<F, icu_provider::DataError>;

// [style][unit], units in spec order: second minute hour day week month quarter year.
const CTORS: [[Ctor; 8]; 3] = [
    [
        F::try_new_long_second,
        F::try_new_long_minute,
        F::try_new_long_hour,
        F::try_new_long_day,
        F::try_new_long_week,
        F::try_new_long_month,
        F::try_new_long_quarter,
        F::try_new_long_year,
    ],
    [
        F::try_new_short_second,
        F::try_new_short_minute,
        F::try_new_short_hour,
        F::try_new_short_day,
        F::try_new_short_week,
        F::try_new_short_month,
        F::try_new_short_quarter,
        F::try_new_short_year,
    ],
    [
        F::try_new_narrow_second,
        F::try_new_narrow_minute,
        F::try_new_narrow_hour,
        F::try_new_narrow_day,
        F::try_new_narrow_week,
        F::try_new_narrow_month,
        F::try_new_narrow_quarter,
        F::try_new_narrow_year,
    ],
];

pub struct RelativeTimeFormat {
    locale: Locale,
    style: usize,
    auto: bool,
    // [numeric always, numeric auto] × unit
    cells: [[OnceLock<Option<F>>; 8]; 2],
    // Same number formatting as the pattern's; only used to recover the number's parts.
    decimal: OnceLock<Option<DecimalFormatter>>,
    // Root symbols (group, decimal) to use instead of the locale's; see `new`.
    root_symbols: Option<(&'static str, &'static str)>,
}

impl RelativeTimeFormat {
    /// `locale` may carry -u-nu-…; `style`: 0 long, 1 short, 2 narrow.
    pub fn new(locale: &str, style: u8, auto: bool) -> Option<Self> {
        let locale: Locale = locale.parse().ok()?;
        // CLDR: a locale without symbols for an explicit -u-nu- inherits root's for that system;
        // ICU4X keeps the locale's own. Only arab and arabext have non-Latin root symbols.
        let nu = locale
            .extensions
            .unicode
            .keywords
            .get(&icu::locale::extensions::unicode::key!("nu"))
            .map(|v| v.to_string());
        let mut base = locale.clone();
        base.extensions.unicode.clear();
        let root_symbols = match nu.as_deref() {
            Some(n @ ("arab" | "arabext"))
                if crate::locale::default_numbering_system(&base.to_string()) != n =>
            {
                Some(("٬", "٫"))
            }
            _ => None,
        };
        Some(Self {
            root_symbols,
            locale,
            style: (style as usize).min(2),
            auto,
            cells: Default::default(),
            decimal: OnceLock::new(),
        })
    }

    fn formatter(&self, unit: usize, auto: bool) -> Option<&F> {
        self.cells[auto as usize][unit]
            .get_or_init(|| {
                let mut o = RelativeTimeFormatterOptions::default();
                o.numeric = if auto { Numeric::Auto } else { Numeric::Always };
                CTORS[self.style][unit]((&self.locale).into(), o).ok()
            })
            .as_ref()
    }

    /// FormatRelativeTime: the string, plus the number in it (None for a phrase like "tomorrow").
    /// `value` must be finite, `unit` 0..=7.
    pub fn format(&self, value: f64, unit: u8) -> Option<String> {
        let (text, number) = self.raw(value, unit)?;
        Some(match number {
            // Rare: an explicit -u-nu-arab/arabext needs root's separators (see `new`), set via the parts.
            Some(d) if self.root_symbols.is_some() => self
                .split_number(text, d)
                .into_iter()
                .map(|s| s.1)
                .collect(),
            _ => text,
        })
    }

    fn raw(&self, value: f64, unit: u8) -> Option<(String, Option<Decimal>)> {
        let unit = (unit as usize).min(7);
        let write =
            |f: &F, d: Decimal| writeable::Writeable::write_to_string(&f.format(d)).into_owned();
        // numeric "auto" keys on ToString(value): only exact integers can hit a phrase, and CLDR has
        // phrases for offsets -3..=3 only ("the day before yesterday" … "in three days").
        if self.auto && value.fract() == 0.0 && value.abs() <= 3.0 {
            let exact = Decimal::from(value as i64);
            let numeric = self.formatter(unit, false)?;
            let auto = write(self.formatter(unit, true)?, exact.clone());
            if auto != write(numeric, exact.clone()) {
                return Some((auto, None));
            }
            let d = if value == 0.0 && value.is_sign_negative() {
                neg_zero()
            } else {
                exact
            };
            return Some((write(numeric, d.clone()), Some(d)));
        }
        let mut d = crate::plural::from_f64(value)?;
        // [[NumberFormat]] defaults: maximumFractionDigits 3, halfExpand.
        d.absolute
            .round_with_mode(-3, UnsignedRoundingMode::HalfExpand);
        d.absolute.trim_end();
        Some((write(self.formatter(unit, false)?, d.clone()), Some(d)))
    }

    /// FormatRelativeTimeToParts as flat segments.
    pub fn segments(&self, value: f64, unit: u8) -> Option<Vec<(u8, String)>> {
        let (text, number) = self.raw(value, unit)?;
        Some(match number {
            Some(d) => self.split_number(text, d),
            None => vec![(parts::LITERAL, text)],
        })
    }

    /// ICU4X flattens the interpolated number, so find it again and splice its parts in.
    // Relative-time patterns hold no digits of their own, so the first match is the number.
    fn split_number(&self, text: String, mut d: Decimal) -> Vec<(u8, String)> {
        d.sign = fixed_decimal::Sign::None;
        let Some(df) = self.decimal.get_or_init(|| {
            DecimalFormatter::try_new((&self.locale).into(), Default::default()).ok()
        }) else {
            return vec![(parts::LITERAL, text)];
        };
        let num = df.format(&d);
        let num_text = writeable::Writeable::write_to_string(&num);
        let Some(at) = text.find(&*num_text) else {
            return vec![(parts::LITERAL, text)];
        };
        let mut segs = Vec::new();
        if at > 0 {
            segs.push((parts::LITERAL, text[..at].to_owned()));
        }
        let mut num_segs = parts::segments(&num);
        if let Some((group, decimal)) = self.root_symbols {
            for (k, t) in &mut num_segs {
                match *k {
                    parts::GROUP => *t = group.to_owned(),
                    parts::DECIMAL => *t = decimal.to_owned(),
                    _ => {}
                }
            }
        }
        segs.extend(num_segs);
        if at + num_text.len() < text.len() {
            segs.push((parts::LITERAL, text[at + num_text.len()..].to_owned()));
        }
        segs
    }
}

fn neg_zero() -> Decimal {
    let mut d = Decimal::from(0);
    d.sign = fixed_decimal::Sign::Negative;
    d
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fmt(loc: &str, style: u8, auto: bool, v: f64, unit: u8) -> String {
        let f = RelativeTimeFormat::new(loc, style, auto).unwrap();
        let text = f.format(v, unit).unwrap();
        assert_eq!(
            text,
            f.segments(v, unit)
                .unwrap()
                .into_iter()
                .map(|s| s.1)
                .collect::<String>()
        );
        text
    }

    #[test]
    fn formats() {
        assert_eq!(fmt("en", 0, false, -3.0, 3), "3 days ago");
        assert_eq!(fmt("en", 0, true, -1.0, 3), "yesterday");
        assert_eq!(fmt("en", 0, true, -5.0, 3), "5 days ago");
        assert_eq!(fmt("en", 0, true, 0.9999, 3), "in 1 day");
        assert_eq!(fmt("en", 0, false, 1000.5, 2), "in 1,000.5 hours");
        assert_eq!(fmt("en", 0, false, -0.0, 0), "0 seconds ago");
        assert_eq!(fmt("en", 0, true, -0.0, 3), "today");
        assert_eq!(fmt("en", 1, false, 2.0, 5), "in 2 mo.");
        assert_eq!(fmt("en-u-nu-arab", 1, false, 1234.5, 0), "in ١٬٢٣٤٫٥ sec.");
        let arab = RelativeTimeFormat::new("en-u-nu-arab", 1, false)
            .unwrap()
            .segments(1234.5, 0)
            .unwrap();
        assert_eq!(arab.iter().filter(|s| s.0 == parts::GROUP).count(), 1);
        let segs = RelativeTimeFormat::new("en", 0, false)
            .unwrap()
            .segments(1234.5, 3)
            .unwrap();
        let kinds: Vec<u8> = segs.iter().map(|s| s.0).collect();
        assert_eq!(
            kinds,
            [
                parts::LITERAL,
                parts::INTEGER,
                parts::GROUP,
                parts::INTEGER,
                parts::DECIMAL,
                parts::FRACTION,
                parts::LITERAL
            ]
        );
    }
}
