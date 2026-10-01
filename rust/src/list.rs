//! Intl.ListFormat core (§14.5).

use crate::parts;
use icu::list::options::{ListFormatterOptions, ListLength};
use icu::list::ListFormatter;
use icu::locale::Locale;

/// `kind`: 0 conjunction, 1 disjunction, 2 unit. `style`: 0 long, 1 short, 2 narrow.
pub fn new(locale: &str, kind: u8, style: u8) -> Option<ListFormatter> {
    let loc: Locale = locale.parse().ok()?;
    let length = [ListLength::Wide, ListLength::Short, ListLength::Narrow][(style as usize).min(2)];
    let o = ListFormatterOptions::default().with_length(length);
    match kind {
        0 => ListFormatter::try_new_and((&loc).into(), o),
        1 => ListFormatter::try_new_or((&loc).into(), o),
        _ => ListFormatter::try_new_unit((&loc).into(), o),
    }
    .ok()
}

pub fn segments(f: &ListFormatter, items: &[&str]) -> Vec<(u8, String)> {
    parts::segments(&f.format(items.iter()))
}

#[cfg(test)]
mod tests {
    #[test]
    fn formats() {
        let f = super::new("en", 1, 0).unwrap();
        let segs = super::segments(&f, &["a", "b", "c"]);
        let text: String = segs.iter().map(|s| s.1.as_str()).collect();
        assert_eq!(text, "a, b, or c");
        assert_eq!(
            segs.iter().filter(|s| s.0 == crate::parts::ELEMENT).count(),
            3
        );
    }
}
