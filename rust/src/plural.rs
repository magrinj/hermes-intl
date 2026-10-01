//! Intl.PluralRules core: FormatNumericToString (§16.5.3) + PluralRuleSelect(Range) (§17.5).
//! Options arrive already read and validated by the JS layer (SetNumberFormatDigitOptions).

use fixed_decimal::{
    CompactDecimal, Decimal, FloatPrecision, RoundingIncrement, SignedRoundingMode,
    UnsignedRoundingMode,
};
use icu::decimal::CompactDecimalFormatter;
use icu::locale::Locale;
use icu::plurals::{PluralCategory, PluralOperands, PluralRules, PluralRulesWithRanges};

#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct Options {
    pub ordinal: bool,
    /// 0 standard, 1 scientific, 2 engineering, 3 compact
    pub notation: u8,
    pub compact_long: bool,
    pub min_fraction: u8,
    pub max_fraction: u8,
    pub min_significant: u8,
    pub max_significant: u8,
    /// 0 fraction-digits, 1 significant-digits, 2 more-precision, 3 less-precision
    pub rounding_type: u8,
    pub rounding_increment: u16,
    /// Index into ceil, floor, expand, trunc, halfCeil, halfFloor, halfExpand, halfTrunc, halfEven
    pub rounding_mode: u8,
    pub strip_if_integer: bool,
}

pub struct Rules {
    rules: PluralRulesWithRanges<PluralRules>,
    compact: Option<CompactDecimalFormatter>,
    o: Options,
}

/// A number after ResolvePlural's formatting: the rounded digits plus the notation exponent.
/// Two of these compare equal iff their FormattedStrings would.
#[derive(PartialEq)]
pub enum Formatted {
    NonFinite,
    Finite(String, i16),
}

pub const ALL: [PluralCategory; 6] = [
    PluralCategory::Zero,
    PluralCategory::One,
    PluralCategory::Two,
    PluralCategory::Few,
    PluralCategory::Many,
    PluralCategory::Other,
];

impl Rules {
    pub fn new(locale: &str, o: Options) -> Option<Self> {
        let loc: Locale = locale.parse().ok()?;
        let prefs = (&loc).into();
        let rules = if o.ordinal {
            PluralRulesWithRanges::try_new_ordinal(prefs)
        } else {
            PluralRulesWithRanges::try_new_cardinal(prefs)
        }
        .ok()?;
        let compact = match (o.notation, o.compact_long) {
            (3, false) => Some(
                CompactDecimalFormatter::try_new_short((&loc).into(), Default::default()).ok()?,
            ),
            (3, true) => Some(
                CompactDecimalFormatter::try_new_long((&loc).into(), Default::default()).ok()?,
            ),
            _ => None,
        };
        Some(Self { rules, compact, o })
    }

    /// Bit i set = ALL[i] is a possible result.
    pub fn categories(&self) -> u8 {
        let cats: Vec<_> = self.rules.rules().categories().collect();
        ALL.iter()
            .enumerate()
            .filter(|(_, c)| cats.contains(c))
            .fold(0, |m, (i, _)| m | 1 << i)
    }

    pub fn select(&self, x: Option<Decimal>) -> PluralCategory {
        match x {
            Some(x) => self.category(&x).0,
            None => PluralCategory::Other,
        }
    }

    pub fn select_range(&self, x: Option<Decimal>, y: Option<Decimal>) -> PluralCategory {
        let (cx, fx) = self.resolve(x);
        let (cy, fy) = self.resolve(y);
        if fx == fy {
            cx
        } else {
            self.rules.resolve_range(cx, cy)
        }
    }

    /// ResolvePlural: the category and the formatted number it was read from.
    fn category(&self, x: &Decimal) -> (PluralCategory, Decimal, i16) {
        let (d, exp) = self.format_with_exponent(x);
        (self.rules.rules().category_for(operands(&d, exp)), d, exp)
    }

    /// ResolvePlural with its FormattedString, for selectRange. `None` = NaN or ±Infinity.
    fn resolve(&self, x: Option<Decimal>) -> (PluralCategory, Formatted) {
        match x {
            Some(x) => {
                let (c, d, exp) = self.category(&x);
                (c, Formatted::Finite(d.to_string(), exp))
            }
            None => (PluralCategory::Other, Formatted::NonFinite),
        }
    }

    /// ComputeExponent (§16.5.13) folded with FormatNumericToString of the scaled value.
    fn format_with_exponent(&self, x: &Decimal) -> (Decimal, i16) {
        if self.o.notation == 0 || x.absolute.is_zero() {
            return (self.format(x), 0);
        }
        let mag = x.absolute.nonzero_magnitude_start();
        let scaled = |e: i16| {
            let mut s = x.clone();
            s.multiply_pow10(-e);
            self.format(&s)
        };
        let e = self.exponent_for(mag);
        let f = scaled(e);
        if f.absolute.is_zero() || f.absolute.nonzero_magnitude_start() == mag - e {
            return (f, e);
        }
        let e = self.exponent_for(mag + 1);
        (scaled(e), e)
    }

    fn exponent_for(&self, mag: i16) -> i16 {
        match (self.o.notation, &self.compact) {
            (1, _) => mag,
            (2, _) => mag.div_euclid(3) * 3,
            (_, Some(c)) => c.compact_exponent_for_magnitude(mag) as i16,
            _ => 0,
        }
    }

    /// FormatNumericToString: the rounded value with exactly its visible fraction digits.
    fn format(&self, x: &Decimal) -> Decimal {
        let o = &self.o;
        let fixed = || {
            raw_fixed(
                x,
                o.min_fraction,
                o.max_fraction,
                o.rounding_increment,
                o.rounding_mode,
            )
        };
        let prec = || raw_precision(x, o.min_significant, o.max_significant, o.rounding_mode);
        let (mut d, _) = match o.rounding_type {
            0 => fixed(),
            1 => prec(),
            t => {
                let (f, s) = (fixed(), prec());
                let fixed_more_precise = f.1 < s.1;
                if (t == 2) == fixed_more_precise {
                    f
                } else {
                    s
                }
            }
        };
        if o.strip_if_integer && d.absolute.nonzero_magnitude_end() >= 0 {
            d.absolute.trim_end();
        }
        d
    }
}

fn mode(i: u8) -> SignedRoundingMode {
    use SignedRoundingMode as S;
    use UnsignedRoundingMode as U;
    [
        S::Ceil,
        S::Floor,
        S::Unsigned(U::Expand),
        S::Unsigned(U::Trunc),
        S::HalfCeil,
        S::HalfFloor,
        S::Unsigned(U::HalfExpand),
        S::Unsigned(U::HalfTrunc),
        S::Unsigned(U::HalfEven),
    ][i.min(8) as usize]
}

/// ToRawFixed (§16.5.9). Returns (rounded value, RoundingMagnitude).
fn raw_fixed(x: &Decimal, min_f: u8, max_f: u8, inc: u16, m: u8) -> (Decimal, i16) {
    // increment = k × 10^j, k ∈ {1, 2, 5, 25}; round multiples of k at position j - maxFraction.
    let (mut k, mut j) = (inc, 0i16);
    while k >= 10 && k % 10 == 0 {
        k /= 10;
        j += 1;
    }
    let k = match k {
        2 => RoundingIncrement::MultiplesOf2,
        5 => RoundingIncrement::MultiplesOf5,
        25 => RoundingIncrement::MultiplesOf25,
        _ => RoundingIncrement::MultiplesOf1,
    };
    let mut d = x.clone();
    d.round_with_mode_and_increment(j - max_f as i16, mode(m), k);
    d.absolute.trim_end();
    d.absolute.pad_end(-(min_f as i16));
    (d, -(max_f as i16))
}

/// ToRawPrecision (§16.5.8). Returns (rounded value, RoundingMagnitude).
fn raw_precision(x: &Decimal, min_p: u8, max_p: u8, m: u8) -> (Decimal, i16) {
    let (min_p, max_p) = (min_p as i16, max_p as i16);
    let mut d = x.clone();
    if !d.absolute.is_zero() {
        d.round_with_mode(d.absolute.nonzero_magnitude_start() - max_p + 1, mode(m));
    }
    let e = d.absolute.nonzero_magnitude_start(); // after rounding: 9.99 → 10 bumps it
    d.absolute.trim_end();
    d.absolute.pad_end((e - min_p + 1).min(0));
    (d, e - max_p + 1)
}

/// The plural operands of mantissa × 10^exp, for every notation: the whole value, with a positive
/// exponent as the `c` operand (CLDR samples list 1000 as "1c3" under English "other"). CLDR
/// defines `c` for compact notation only, so a negative scientific exponent gets none.
fn operands(d: &Decimal, exp: i16) -> PluralOperands {
    if exp > 0 {
        // CLDR rules test c up to 5 and i up to 18 digits: 255 decides like any larger exponent.
        let c = exp.min(u8::MAX as i16) as u8;
        return (&CompactDecimal::from_significand_and_exponent(d.clone(), c)).into();
    }
    let mut whole = d.clone();
    whole.multiply_pow10(exp);
    (&whole).into()
}

/// A JS Number as the Intl mathematical value (shortest round-trip digits, like ICU4C). None = NaN/±∞.
pub fn from_f64(v: f64) -> Option<Decimal> {
    if !v.is_finite() {
        return None;
    }
    let mut d = Decimal::try_from_f64(v, FloatPrecision::RoundTrip).ok()?;
    if v == 0.0 && v.is_sign_negative() {
        d.sign = fixed_decimal::Sign::Negative;
    }
    Some(d)
}

/// A normalized decimal literal from the JS layer: `[-]digits[.digits][e[-]digits]`.
pub fn from_str(s: &str) -> Option<Decimal> {
    let (m, e) = match s.find(['e', 'E']) {
        Some(i) => (&s[..i], s[i + 1..].parse::<i16>().ok()?),
        None => (s, 0),
    };
    let mut d: Decimal = m.parse().ok()?;
    d.multiply_pow10(e);
    Some(d)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn o() -> Options {
        Options {
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
        }
    }
    fn fmt(opts: Options, s: &str) -> String {
        Rules::new("en", opts)
            .unwrap()
            .format(&from_str(s).unwrap())
            .to_string()
    }

    #[test]
    fn rounding() {
        assert_eq!(fmt(o(), "1.23456"), "1.235");
        assert_eq!(fmt(o(), "1.50"), "1.5");
        assert_eq!(
            fmt(
                Options {
                    min_fraction: 2,
                    ..o()
                },
                "1"
            ),
            "1.00"
        );
        assert_eq!(
            fmt(
                Options {
                    max_fraction: 2,
                    rounding_increment: 25,
                    min_fraction: 2,
                    ..o()
                },
                "1.13"
            ),
            "1.25"
        );
        let sd = Options {
            rounding_type: 1,
            min_significant: 1,
            max_significant: 2,
            ..o()
        };
        assert_eq!(fmt(sd, "9.99"), "10");
        assert_eq!(fmt(sd, "0.0123"), "0.012");
        assert_eq!(
            fmt(
                Options {
                    min_significant: 3,
                    max_significant: 3,
                    ..sd
                },
                "1"
            ),
            "1.00"
        );
        assert_eq!(
            fmt(
                Options {
                    rounding_mode: 3,
                    ..o()
                },
                "-1.0009"
            ),
            "-1"
        );
        assert_eq!(
            fmt(
                Options {
                    min_fraction: 2,
                    strip_if_integer: true,
                    ..o()
                },
                "2.0001"
            ),
            "2"
        );
    }

    #[test]
    fn select() {
        let fr = |n| {
            Rules::new(
                "fr",
                Options {
                    notation: n,
                    rounding_type: 2,
                    min_fraction: 0,
                    max_fraction: 0,
                    max_significant: 2,
                    ..o()
                },
            )
            .unwrap()
        };
        // test262 prototype/select/notation.js
        assert_eq!(fr(0).select(from_f64(1.5e6)), PluralCategory::Other);
        assert_eq!(fr(3).select(from_f64(1.5e6)), PluralCategory::Many);
        assert_eq!(fr(3).select(from_f64(1e6)), PluralCategory::Many);
        let en = Rules::new(
            "en",
            Options {
                min_fraction: 1,
                ..o()
            },
        )
        .unwrap();
        assert_eq!(en.select(from_f64(1.0)), PluralCategory::Other); // "1.0"
        assert_eq!(Rules::new("ar", o()).unwrap().categories(), 0b111111);
    }

    #[test]
    fn scientific_and_engineering_select_on_the_whole_value() {
        let rules = |locale, notation| Rules::new(locale, Options { notation, ..o() }).unwrap();
        // 1E3 is 1000: "other" in English, not the "one" of its mantissa.
        assert_eq!(
            rules("en", 1).select(from_f64(1000.0)),
            PluralCategory::Other
        );
        assert_eq!(
            rules("en", 2).select(from_f64(1000.0)),
            PluralCategory::Other
        );
        assert_eq!(rules("en", 1).select(from_f64(1.0)), PluralCategory::One);
        assert_eq!(
            rules("pl", 1).select(from_f64(2000.0)),
            PluralCategory::Many
        );
        // The exponent is the c operand, as in compact notation.
        assert_eq!(rules("fr", 1).select(from_f64(1.5e6)), PluralCategory::Many);
    }

    #[test]
    fn select_range_keeps_the_whole_exponent() {
        let en = Rules::new("en", Options { notation: 1, ..o() }).unwrap();
        // 1E-5 and 1E256 used to compare equal to 1E0, which skipped the range rules.
        assert_eq!(
            en.select_range(from_f64(1e-5), from_f64(1.0)),
            PluralCategory::Other
        );
        assert_eq!(
            en.select_range(from_f64(1.0), from_f64(1e256)),
            PluralCategory::Other
        );
    }
}
