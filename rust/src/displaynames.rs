//! Intl.DisplayNames core (§12). Codes arrive canonical (CanonicalCodeForDisplayNames, in JS).
//! Language, region, script and currency names come from ICU4X; calendar and date-time field
//! names and the locale display pattern from CLDR via displaynames_data.rs.

use crate::displaynames_data as data;
use icu::locale::{LanguageIdentifier, Locale};
use icu_experimental::dimension::provider::currency::displayname::CurrencyDisplaynameV1;
use icu_experimental::displaynames::provider::*;
use icu_experimental::provider::Baked;
use icu_provider::prelude::*;
use potential_utf::PotentialUtf8;
use tinystr::TinyAsciiStr;
use zerovec::ZeroMap;

type Names<'a, const N: usize> = ZeroMap<'a, tinystr::UnvalidatedTinyAsciiStr<N>, str>;

fn get<'a, const N: usize>(map: &'a Names<N>, code: &str) -> Option<&'a str> {
    map.get(&TinyAsciiStr::<N>::try_from_str(code).ok()?.to_unvalidated())
}

fn load<M: DataMarker>(locale: &DataLocale) -> Option<DataPayload<M>>
where
    Baked: DataProvider<M>,
{
    Baked
        .load(DataRequest {
            id: DataIdentifierBorrowed::for_locale(locale),
            ..Default::default()
        })
        .ok()
        .map(|r| r.payload)
}

type Row = &'static [u16; 58];

/// The CLDR row for an available locale, or for its nearest ancestor in the table.
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

fn text(id: u16) -> Option<&'static str> {
    let i = id as usize;
    (id != u16::MAX).then(|| &data::TEXT[data::STARTS[i] as usize..data::STARTS[i + 1] as usize])
}

/// Whether the locale names `code` by the code itself, a name ICU4X data leaves out.
fn self_named(row: Row, kind: &str, code: &str) -> bool {
    let mask = row[56] as u32 | (row[57] as u32) << 16;
    data::SELF_NAMED
        .iter()
        .position(|e| e.0 == kind && e.1 == code)
        .is_some_and(|i| mask >> i & 1 == 1)
}

pub enum DisplayNames {
    Language(Box<Language>),
    Region(Option<DataPayload<RegionDisplayNamesV1>>, Row, bool),
    Script(Option<DataPayload<ScriptDisplayNamesV1>>, Row, bool),
    Currency(DataLocale),
    Calendar(Row),
    Field(Row, usize),
}

pub struct Language {
    dialect: bool,
    short: bool,
    row: Row,
    // None where ICU4X has no data: variant names for about a fifth of the locales, all for und.
    languages: Option<DataPayload<LanguageDisplayNamesV1>>,
    locales: Option<DataPayload<LocaleDisplayNamesV1>>,
    scripts: Option<DataPayload<ScriptDisplayNamesV1>>,
    regions: Option<DataPayload<RegionDisplayNamesV1>>,
    variants: Option<DataPayload<VariantDisplayNamesV1>>,
}

impl DisplayNames {
    /// `kind`: 0 language, 1 region, 2 script, 3 currency, 4 calendar, 5 dateTimeField.
    /// `style`: 0 long, 1 short, 2 narrow.
    pub fn new(locale: &str, kind: u8, style: u8, dialect: bool) -> Option<Self> {
        let loc: Locale = locale.parse().ok()?;
        let dl = DataLocale::from(&loc);
        let short = style != 0;
        Some(match kind {
            0 => Self::Language(Box::new(Language {
                dialect,
                short,
                row: row(locale),
                languages: load(&dl),
                locales: load(&dl),
                scripts: load(&dl),
                regions: load(&dl),
                variants: load(&dl),
            })),
            1 => Self::Region(load(&dl), row(locale), short),
            2 => Self::Script(load(&dl), row(locale), short),
            3 => Self::Currency(dl),
            4 => Self::Calendar(row(locale)),
            _ => Self::Field(row(locale), (style as usize).min(2)),
        })
    }

    /// The name for a canonical code, if there is one.
    pub fn of(&self, code: &str) -> Option<String> {
        match self {
            Self::Language(l) => l.of(code),
            Self::Region(d, row, short) => {
                region(d.as_ref()?.get(), row, *short, code).map(Into::into)
            }
            Self::Script(d, row, short) => {
                script(d.as_ref()?.get(), row, *short, code).map(Into::into)
            }
            Self::Currency(locale) => {
                let attrs = DataMarkerAttributes::try_from_str(code).ok()?;
                let r: DataResponse<CurrencyDisplaynameV1> = Baked
                    .load(DataRequest {
                        id: DataIdentifierBorrowed::for_marker_attributes_and_locale(attrs, locale),
                        ..Default::default()
                    })
                    .ok()?;
                Some(String::from(&**r.payload.get()))
            }
            // CLDR keys the two Ethiopic calendars by "ethiopic-amete-alem"; BCP 47 by "ethioaa".
            Self::Calendar(row) => {
                let code = if code == "ethiopic-amete-alem" {
                    "ethioaa"
                } else {
                    code
                };
                let i = data::CALENDARS.iter().position(|c| *c == code)?;
                text(row[i]).map(Into::into)
            }
            Self::Field(row, style) => {
                let i = data::FIELDS.iter().position(|f| *f == code)?;
                text(row[18 + 12 * style + i]).map(Into::into)
            }
        }
    }
}

fn region<'a>(d: &'a RegionDisplayNames, row: Row, short: bool, code: &'a str) -> Option<&'a str> {
    let short_name = || {
        get(&d.short_names, code).or_else(|| self_named(row, "territories", code).then_some(code))
    };
    short
        .then(short_name)
        .flatten()
        .or_else(|| get(&d.names, code))
}

fn script<'a>(d: &'a ScriptDisplayNames, row: Row, short: bool, code: &'a str) -> Option<&'a str> {
    short
        .then(|| get(&d.short_names, code))
        .flatten()
        .or_else(|| get(&d.names, code))
        .or_else(|| self_named(row, "scripts", code).then_some(code))
}

impl Language {
    /// UTS 35 locale display name, as ICU builds it: one dialect name for the language with its
    /// script and region, or its script, or its region, then the remaining subtags in parentheses.
    fn of(&self, code: &str) -> Option<String> {
        let id: LanguageIdentifier = code.parse().ok()?;
        let lang = id.language.as_str();
        let mut script = id.script;
        let mut region = id.region;
        let mut name = None;
        if self.dialect {
            let key = match (script, region) {
                (Some(s), Some(r)) => Some(format!("{lang}-{s}-{r}")),
                (Some(s), None) => Some(format!("{lang}-{s}")),
                (None, Some(r)) => Some(format!("{lang}-{r}")),
                _ => None,
            };
            if let Some(key) = key {
                name = self.dialect_name(&key);
                if name.is_some() {
                    script = None;
                    region = None;
                }
            }
        }
        let d = self.languages.as_ref()?.get();
        let name = name.or_else(|| {
            self.short
                .then(|| get(&d.short_names, lang))
                .flatten()
                .or_else(|| get(&d.names, lang))
                .or_else(|| self_named(self.row, "languages", lang).then_some(lang))
        })?;
        let mut qualifiers = Vec::new();
        if let Some(s) = &script {
            qualifiers.push(self::script(
                self.scripts.as_ref()?.get(),
                self.row,
                self.short,
                s.as_str(),
            )?);
        }
        if let Some(r) = &region {
            qualifiers.push(self::region(
                self.regions.as_ref()?.get(),
                self.row,
                self.short,
                r.as_str(),
            )?);
        }
        for v in id.variants.iter() {
            qualifiers.push(get(&self.variants.as_ref()?.get().names, v.as_str())?);
        }
        if qualifiers.is_empty() {
            return Some(name.into());
        }
        let pattern = text(self.row[54]).unwrap_or("{0} ({1})");
        let separator = text(self.row[55]).unwrap_or("{0}, {1}");
        // As in ICU: brackets for parentheses inside a qualifier ("Hong Kong [China]").
        let brackets = |q: &str| match pattern.contains('（') {
            true => q.replace('（', "［").replace('）', "］"),
            false => q.replace('(', "[").replace(')', "]"),
        };
        let mut joined = brackets(qualifiers[0]);
        for q in &qualifiers[1..] {
            joined = separator
                .replace("{0}", &joined)
                .replace("{1}", &brackets(q));
        }
        Some(pattern.replace("{0}", name).replace("{1}", &joined))
    }

    fn dialect_name(&self, key: &str) -> Option<&str> {
        let d = self.locales.as_ref()?.get();
        let k = PotentialUtf8::from_str(key);
        self.short
            .then(|| d.short_names.get(k))
            .flatten()
            .or_else(|| d.names.get(k))
    }
}

#[cfg(test)]
mod tests {
    use super::DisplayNames;

    fn of(locale: &str, kind: u8, style: u8, code: &str) -> Option<String> {
        DisplayNames::new(locale, kind, style, true)
            .unwrap()
            .of(code)
    }

    #[test]
    fn every_shipped_locale() {
        let missing: Vec<_> = include_str!("../locales/recommended.txt")
            .lines()
            .chain(["und"])
            .flat_map(|l| (0..6).map(move |kind| (l, kind)))
            .filter(|&(l, kind)| DisplayNames::new(l, kind, 0, true).is_none())
            .collect();
        assert_eq!(missing, []);
        assert_eq!(of("sw", 0, 0, "de").as_deref(), Some("Kijerumani"));
        assert_eq!(of("und", 1, 0, "DE"), None);
    }

    #[test]
    fn names() {
        assert_eq!(of("en", 0, 0, "en-GB").as_deref(), Some("British English"));
        assert_eq!(
            of("en", 0, 0, "zh-Hant").as_deref(),
            Some("Traditional Chinese")
        );
        assert_eq!(
            of("en", 0, 0, "zh-Hant-HK").as_deref(),
            Some("Chinese (Traditional, Hong Kong SAR China)")
        );
        assert_eq!(
            of("en", 0, 0, "de-CH-1996").as_deref(),
            Some("Swiss High German (German orthography of 1996)")
        );
        assert_eq!(of("en", 0, 1, "en-US").as_deref(), Some("US English"));
        assert_eq!(of("en", 0, 0, "xx-US"), None);
        assert_eq!(
            of("zh", 0, 0, "fr-Latn-FR").as_deref(),
            Some("法语（拉丁文，法国）")
        );
        assert_eq!(
            of("ja", 0, 0, "fr-Latn-FR").as_deref(),
            Some("フランス語 (ラテン文字、フランス)")
        );
        let standard = DisplayNames::new("en", 0, 0, false).unwrap();
        assert_eq!(
            standard.of("en-GB").as_deref(),
            Some("English (United Kingdom)")
        );
        assert_eq!(of("en", 1, 0, "GB").as_deref(), Some("United Kingdom"));
        assert_eq!(of("en", 1, 1, "GB").as_deref(), Some("UK"));
        assert_eq!(of("en", 1, 0, "XX"), None);
        assert_eq!(of("en", 2, 0, "Latn").as_deref(), Some("Latin"));
        assert_eq!(of("en", 3, 0, "USD").as_deref(), Some("US Dollar"));
        assert_eq!(
            of("fr", 3, 0, "USD").as_deref(),
            Some("dollar des États-Unis")
        );
        assert_eq!(of("en", 3, 0, "ABC"), None);
        assert_eq!(
            of("en", 4, 0, "gregory").as_deref(),
            Some("Gregorian Calendar")
        );
        assert_eq!(
            of("en", 4, 0, "ethiopic-amete-alem").as_deref(),
            Some("Ethiopic Amete Alem Calendar")
        );
        assert_eq!(of("en", 4, 0, "abc"), None);
        assert_eq!(
            of("en", 5, 0, "weekday").as_deref(),
            Some("day of the week")
        );
        assert_eq!(of("en", 5, 1, "year").as_deref(), Some("yr."));
        assert_eq!(of("en", 5, 2, "year").as_deref(), Some("yr"));
        assert_eq!(of("fr", 5, 0, "dayPeriod").as_deref(), Some("cadran"));
        assert_eq!(
            of("en-GB", 5, 0, "timeZoneName").as_deref(),
            Some("time zone")
        );
    }
}
