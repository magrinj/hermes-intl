//! ECMA-402 locale plumbing: well-formedness, canonicalization, lookup (§9.2).

use icu::locale::{Direction, Locale, LocaleCanonicalizer, LocaleDirectionality, LocaleExpander};
use std::sync::OnceLock;

/// IsWellFormedLanguageTag + CanonicalizeUnicodeLocaleId. `None` = RangeError.
pub fn canonicalize(tag: &str) -> Option<String> {
    // ICU4X also accepts `_` separators; BCP 47 does not.
    if tag.is_empty() || tag.contains('_') {
        return None;
    }
    // ICU4X languages are 2-3 letters; unicode_language_subtag also allows 5-8 ("posix").
    // Canonicalize the rest under "und" and put the language back (no aliases exist for them).
    let first = tag.split('-').next().unwrap_or("");
    let long = (5..=8).contains(&first.len()) && first.bytes().all(|b| b.is_ascii_alphabetic());
    let parsed = if long {
        format!("und{}", &tag[first.len()..])
    } else {
        tag.to_owned()
    };
    let mut loc: Locale = parsed.parse().ok()?;
    static C: OnceLock<LocaleCanonicalizer> = OnceLock::new();
    C.get_or_init(LocaleCanonicalizer::new_extended)
        .canonicalize(&mut loc);
    canonicalize_keyword_values(&mut loc);
    let out = loc.to_string();
    Some(if long {
        format!("{}{}", first.to_ascii_lowercase(), &out[3..])
    } else {
        out
    })
}

/// The -u- value half of UTS 35 canonicalization, which ICU4X leaves out: "yes" means "true",
/// "true" is dropped, and deprecated values map to their preferred ones (CLDR bcp47/*.xml).
// The aliases CLDR lists for ca, ks, ms and the common tz ones; extend from CLDR as needed.
fn canonicalize_keyword_values(loc: &mut Locale) {
    use icu::locale::extensions::unicode::Value;
    const ALIASES: &[(&str, &str, &str)] = &[
        ("ca", "ethiopic-amete-alem", "ethioaa"),
        ("ca", "islamicc", "islamic-civil"),
        ("ks", "primary", "level1"),
        ("ks", "secondary", "level2"),
        ("ks", "tertiary", "level3"),
        ("ks", "quarternary", "level4"),
        ("ks", "quaternary", "level4"),
        ("ks", "identical", "identic"),
        ("ms", "imperial", "uksystem"),
        ("tz", "aqams", "nzakl"),
        ("tz", "cnckg", "cnsha"),
        ("tz", "cnhrb", "cnsha"),
        ("tz", "cnkhg", "cnurc"),
        ("tz", "cuba", "cuhav"),
        ("tz", "egypt", "egcai"),
        ("tz", "eire", "iedub"),
        ("tz", "est", "papty"),
        ("tz", "gmt0", "gmt"),
        ("tz", "hongkong", "hkhkg"),
        ("tz", "hst", "utcw10"),
        ("tz", "iceland", "isrey"),
        ("tz", "iran", "irthr"),
        ("tz", "israel", "jeruslm"),
        ("tz", "jamaica", "jmkin"),
        ("tz", "japan", "jptyo"),
        ("tz", "libya", "lytip"),
        ("tz", "mst", "utcw07"),
        ("tz", "navajo", "usden"),
        ("tz", "poland", "plwaw"),
        ("tz", "portugal", "ptlis"),
        ("tz", "prc", "cnsha"),
        ("tz", "roc", "twtpe"),
        ("tz", "rok", "krsel"),
        ("tz", "turkey", "trist"),
        ("tz", "uct", "utc"),
        ("tz", "usnavajo", "usden"),
        ("tz", "zulu", "utc"),
    ];
    let kw = &mut loc.extensions.unicode.keywords;
    let fixes: Vec<_> = kw
        .iter()
        .filter_map(|(k, v)| {
            let v = v.to_string();
            let key = k.as_str();
            // "yes" is an alias of "true" only for the boolean collation keys.
            let boolean = matches!(key, "kb" | "kc" | "kh" | "kk" | "kn");
            let new = if v == "true" || (boolean && v == "yes") {
                String::new()
            } else {
                ALIASES
                    .iter()
                    .find(|a| a.0 == key && a.1 == v)
                    .map(|a| a.2.to_owned())?
            };
            Some((*k, new))
        })
        .collect();
    for (k, v) in fixes {
        kw.set(
            k,
            if v.is_empty() {
                Value::default()
            } else {
                v.parse().unwrap_or_default()
            },
        );
    }
    // The one -t- field alias CLDR defines (bcp47/transform.xml).
    if let Ok(m0) = "m0".parse() {
        let fields = &mut loc.extensions.transform.fields;
        if fields.get(&m0).is_some_and(|v| v.to_string() == "names") {
            if let Ok(v) = "prprname".parse() {
                fields.set(m0, v);
            }
        }
    }
}

mod baked {
    include!(concat!(env!("OUT_DIR"), "/locales.rs"));
}

/// Available locales: the ones the data was built for, canonical and sorted (build.rs).
pub fn available() -> &'static [&'static str] {
    baked::AVAILABLE
}

/// LookupMatchingLocaleByPrefix for one requested (canonical) tag.
// "best fit" also uses this; the spec allows it.
pub fn lookup(requested: &str) -> Option<String> {
    let mut loc: Locale = requested.parse().ok()?;
    loc.extensions.unicode.clear();
    let mut prefix = loc.to_string();
    // CLDR has no "en-US": "en" is US English. A language's likely region (and script) is
    // available whenever the language is, as in ICU's available-locale list.
    if loc.id.region.is_some() && loc.id.variants.is_empty() && loc.extensions.is_empty() {
        let mut max = icu::locale::LanguageIdentifier::from(loc.id.language);
        expander().maximize(&mut max);
        let lang = loc.id.language.to_string();
        if max.region == loc.id.region
            && loc.id.script.is_none_or(|s| Some(s) == max.script)
            && available().binary_search(&lang.as_str()).is_ok()
            && available().binary_search(&prefix.as_str()).is_err()
        {
            return Some(prefix);
        }
    }
    loop {
        if let Ok(i) = available().binary_search(&prefix.as_str()) {
            return Some(available()[i].to_owned());
        }
        let mut pos = prefix.rfind('-')?;
        while pos >= 2 && prefix.as_bytes()[pos - 2] == b'-' {
            pos -= 2;
        }
        prefix.truncate(pos);
    }
}

/// DefaultLocale: the host locale if declared (or a prefix of it), else the first declared.
pub fn default_locale(host: &str) -> String {
    // Device locales are plain tags; skip building the alias canonicalizer at startup unless needed.
    let plain = host
        .parse::<Locale>()
        .ok()
        .and_then(|l| lookup(&l.to_string()));
    plain
        .or_else(|| canonicalize(host).and_then(|t| lookup(&t)))
        .unwrap_or_else(|| baked::FALLBACK.to_owned())
}

fn expander() -> &'static LocaleExpander {
    static E: OnceLock<LocaleExpander> = OnceLock::new();
    E.get_or_init(LocaleExpander::new_extended)
}

/// Add Likely Subtags (extensions kept). `None` if the tag does not parse.
pub fn maximize(tag: &str) -> Option<String> {
    let mut loc: Locale = tag.parse().ok()?;
    expander().maximize(&mut loc.id);
    // CLDR's und rule: whatever likely subtags could not fill falls back to en-Latn-US
    // ("und-150" → "en-Latn-150"). ICU4X leaves such tags as they are.
    if loc.id.language.is_unknown() {
        let en: Locale = "en-Latn-US".parse().ok()?;
        loc.id.language = en.id.language;
        loc.id.script = loc.id.script.or(en.id.script);
        loc.id.region = loc.id.region.or(en.id.region);
    }
    Some(loc.to_string())
}

/// Remove Likely Subtags, favouring region (UTS 35).
pub fn minimize(tag: &str) -> Option<String> {
    let mut loc: Locale = maximize(tag)?.parse().ok()?;
    expander().minimize(&mut loc.id);
    Some(loc.to_string())
}

/// TextDirectionOfLocale: 0 ltr, 1 rtl, 2 unknown.
pub fn direction(tag: &str) -> u8 {
    static D: OnceLock<LocaleDirectionality> = OnceLock::new();
    let Ok(loc) = tag.parse::<Locale>() else {
        return 2;
    };
    match D
        .get_or_init(LocaleDirectionality::new_extended)
        .get(&loc.id)
    {
        Some(Direction::LeftToRight) => 0,
        Some(Direction::RightToLeft) => 1,
        _ => 2,
    }
}

/// RegionPreference: region data needs a region, so fill it in from likely subtags.
fn regional(tag: &str) -> Locale {
    let mut loc: Locale = tag.parse().unwrap_or(Locale::UNKNOWN);
    if loc.id.region.is_none() {
        expander().maximize(&mut loc.id);
    }
    loc
}

/// WeekInfoOfLocale (without the fw override, applied in JS): first day 1 (Mon) ..= 7 (Sun)
/// in the low byte, weekend days as bits 8..=14 (bit 8 + d - 1 for day d).
pub fn week_info(tag: &str) -> u16 {
    use icu::calendar::week::WeekInformation;
    let loc = regional(tag);
    let Ok(w) = WeekInformation::try_new((&loc).into()) else {
        return 1 | 0b1100000 << 8;
    };
    let day = |d: icu::calendar::types::Weekday| d as u16; // Monday = 1 ..= Sunday = 7
    w.weekend()
        .fold(day(w.first_weekday), |m, d| m | 1 << (7 + day(d)))
}

/// The locale's default numbering system (its decimal symbols' `numsys`).
pub fn default_numbering_system(tag: &str) -> String {
    use icu::decimal::provider::{Baked, DecimalSymbolsV1};
    use icu_provider::prelude::*;
    let loc: Locale = tag.parse().unwrap_or(Locale::UNKNOWN);
    let dl = DataLocale::from(&loc);
    DataProvider::<DecimalSymbolsV1>::load(
        &Baked,
        DataRequest {
            id: DataIdentifierBorrowed::for_locale(&dl),
            ..Default::default()
        },
    )
    .map(|r| r.payload.get().numsys().to_owned())
    .unwrap_or_else(|_| "latn".into())
}

/// Whether digits exist for numbering system `nu` (data is keyed by `nu` alone).
pub fn numbering_system_supported(nu: &str) -> bool {
    use icu::decimal::provider::{Baked, DecimalDigitsV1};
    use icu_provider::prelude::*;
    let Ok(attrs) = DataMarkerAttributes::try_from_str(nu) else {
        return false;
    };
    DataProvider::<DecimalDigitsV1>::load(
        &Baked,
        DataRequest {
            id: DataIdentifierBorrowed::for_marker_attributes(attrs),
            metadata: {
                let mut m = DataRequestMetadata::default();
                m.silent = true;
                m
            },
        },
    )
    .is_ok()
}

/// Canonical IANA zones in use in `region` (ISO 3166 alpha-2), sorted, space-separated.
// Geographic BCP 47 zone ids start with their region code, except Jerusalem's.
pub fn time_zones(region: &str) -> String {
    let r = region.to_ascii_lowercase();
    if r.len() != 2 {
        return String::new();
    }
    let mut zones: Vec<&str> = icu::time::zone::iana::IanaParserExtended::new()
        .iter()
        // Etc/* and POSIX-style ids ("EST5EDT", "CET") belong to no region.
        .filter(|z| z.canonical.contains('/') && !z.canonical.starts_with("Etc/"))
        .filter(|z| {
            let id = z.time_zone.0.as_str();
            if id == "jeruslm" {
                r == "il"
            } else {
                id.starts_with(&r)
            }
        })
        .map(|z| z.canonical)
        .collect();
    zones.sort_unstable();
    zones.dedup();
    zones.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn locale_info() {
        assert_eq!(maximize("zh-TW").as_deref(), Some("zh-Hant-TW"));
        assert_eq!(lookup("en-US").as_deref(), Some("en-US")); // likely region of an available language
        assert_eq!(lookup("en-AQ").as_deref(), Some("en")); // not a CLDR locale nor the likely region
        assert_eq!(minimize("en-Latn-US").as_deref(), Some("en"));
        assert_eq!(direction("ar"), 1);
        assert_eq!(direction("en"), 0);
        assert_eq!(week_info("en-US"), 7 | (1 << 13) | (1 << 14)); // Sunday first, Sat+Sun weekend
        assert_eq!(week_info("fr-FR") & 0xff, 1);
        assert_eq!(default_numbering_system("ar-EG"), "arab");
        assert_eq!(default_numbering_system("en"), "latn");
        assert!(numbering_system_supported("thai") && !numbering_system_supported("wxyz"));
        assert!(time_zones("FR").contains("Europe/Paris"));
        assert_eq!(time_zones("IL"), "Asia/Jerusalem");
        assert_eq!(time_zones("GM"), "Africa/Banjul");
    }
}
