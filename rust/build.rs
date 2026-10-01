// Bakes the available-locale list in. HERMES_INTL_LOCALES (space/comma separated) must match the
// data (ICU4X_DATA_DIR); unset = ICU4X's compiled data, whose locales are locales/recommended.txt.
use std::{env, fs, path::Path};

fn main() {
    println!("cargo:rerun-if-env-changed=HERMES_INTL_LOCALES");
    println!("cargo:rerun-if-env-changed=ICU4X_DATA_DIR");
    println!("cargo:rerun-if-changed=locales/recommended.txt");
    let list = env::var("HERMES_INTL_LOCALES").unwrap_or_else(|_| {
        fs::read_to_string("locales/recommended.txt").expect("locales/recommended.txt")
    });
    let mut locales: Vec<String> = list
        .split([',', ' ', '\n'])
        .filter(|s| !s.is_empty())
        .map(|s| {
            let l = icu_locale_core::Locale::try_from_str(s)
                .unwrap_or_else(|e| panic!("bad locale {s:?}: {e:?}"));
            l.to_string()
        })
        .collect();
    let first = locales.first().cloned().unwrap_or_else(|| "und".into());
    let default = if locales.iter().any(|l| l == "en") {
        "en".to_owned()
    } else {
        first
    };
    locales.sort();
    locales.dedup();
    let out = Path::new(&env::var("OUT_DIR").unwrap()).join("locales.rs");
    fs::write(
        out,
        format!("pub static AVAILABLE: &[&str] = &{locales:?};\npub static FALLBACK: &str = {default:?};\n"),
    )
    .unwrap();
}
