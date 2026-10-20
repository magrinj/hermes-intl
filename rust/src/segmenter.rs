//! Intl.Segmenter core (§19): the breaks of a whole UTF-16 string at once.

use icu::locale::{LanguageIdentifier, Locale};
use icu_segmenter::options::{SentenceBreakOptions, WordBreakOptions, WordType};
use icu_segmenter::{GraphemeClusterSegmenter, SentenceSegmenter, WordSegmenter};

pub enum Segmenter {
    Grapheme,
    Word(Box<WordSegmenter>),
    Sentence(Box<SentenceSegmenter>),
}

impl Segmenter {
    /// `granularity`: 0 grapheme, 1 word, 2 sentence.
    pub fn new(locale: &str, granularity: u8) -> Option<Self> {
        let loc: Locale = locale.parse().ok()?;
        let id: LanguageIdentifier = loc.id;
        Some(match granularity {
            0 => Self::Grapheme,
            1 => {
                let mut o = WordBreakOptions::default();
                o.content_locale = Some(&id);
                Self::Word(Box::new(WordSegmenter::try_new_auto(o).ok()?))
            }
            _ => {
                let mut o = SentenceBreakOptions::default();
                o.content_locale = Some(&id);
                Self::Sentence(Box::new(SentenceSegmenter::try_new(o).ok()?))
            }
        })
    }

    /// The end of each segment, with whether it is word-like (word granularity only).
    pub fn breaks(&self, text: &[u16]) -> Vec<(usize, bool)> {
        match self {
            Self::Grapheme => GraphemeClusterSegmenter::new()
                .segment_utf16(text)
                .skip(1)
                .map(|b| (b, false))
                .collect(),
            Self::Word(w) => {
                // ICU4X 2.3's UTF-16 dictionary segmenter stops splitting a CJK run after a
                // supplementary character ("𩸽の刺身"), so words go through UTF-8. A lone
                // surrogate becomes U+FFFD, one unit long like the surrogate.
                let mut utf8 = String::with_capacity(text.len());
                let mut units = vec![0];
                let mut at = 0;
                for c in char::decode_utf16(text.iter().copied()) {
                    let (c, n) = match c {
                        Ok(c) => (c, c.len_utf16()),
                        Err(_) => ('\u{fffd}', 1),
                    };
                    at += n;
                    utf8.push(c);
                    units.resize(utf8.len() + 1, at);
                }
                let w = w.as_borrowed();
                let mut it = w.segment_str(&utf8);
                it.next();
                let mut out = Vec::new();
                let mut start = 0;
                while let Some(end) = it.next() {
                    let mut word = it.word_type() != WordType::None;
                    if !word {
                        // ICU4X types a segment by its last code point, so "é" (e, U+0301) or a
                        // Hindi word ending in a vowel sign come back as non-words. ICU types it
                        // by its rule, which the first code point decides.
                        let first = utf8[start..end].chars().next().map_or(0, char::len_utf8);
                        if end - start > first {
                            let mut f = w.segment_str(&utf8[start..start + first]);
                            f.nth(1);
                            word = f.word_type() != WordType::None;
                        }
                    }
                    out.push((units[end], word));
                    start = end;
                }
                out
            }
            Self::Sentence(s) => s
                .as_borrowed()
                .segment_utf16(text)
                .skip(1)
                .map(|b| (b, false))
                .collect(),
        }
    }
}

/// One u32 per segment: its end, with the word-like flag at bit 30.
pub fn pack(breaks: &[(usize, bool)]) -> Vec<u32> {
    breaks
        .iter()
        .map(|&(end, word)| end as u32 & 0x3fff_ffff | (word as u32) << 30)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::Segmenter;

    fn segs(locale: &str, granularity: u8, text: &str) -> Vec<(String, bool)> {
        let units: Vec<u16> = text.encode_utf16().collect();
        let mut start = 0;
        Segmenter::new(locale, granularity)
            .unwrap()
            .breaks(&units)
            .into_iter()
            .map(|(end, word)| {
                let s = String::from_utf16(&units[start..end]).unwrap();
                start = end;
                (s, word)
            })
            .collect()
    }

    #[test]
    fn breaks() {
        let g = segs("en", 0, "e\u{301}👨‍👩‍👧!");
        assert_eq!(g.len(), 3);
        assert_eq!(g[1].0, "👨‍👩‍👧");
        let w = segs("en", 1, "Hello, world 42");
        let words: Vec<_> = w.iter().filter(|s| s.1).map(|s| s.0.as_str()).collect();
        assert_eq!(words, ["Hello", "world", "42"]);
        let marks = segs("hi", 1, "नमस्ते e\u{301} 👍🏽");
        let marks: Vec<_> = marks.iter().map(|s| s.1).collect();
        assert_eq!(marks, [true, false, true, false, false]);
        assert_eq!(segs("en", 2, "Hi. Bye.").len(), 2);
        assert_eq!(segs("ja", 1, "こんにちは世界").len(), 2);
        let ja: Vec<_> = segs("ja", 1, "日本語𩸽の刺身")
            .into_iter()
            .map(|s| s.0)
            .collect();
        assert_eq!(ja, ["日本語", "𩸽", "の", "刺身"]);
        let lone = Segmenter::new("en", 1)
            .unwrap()
            .breaks(&[0x61, 0xd800, 0x62]);
        let ends: Vec<_> = lone.into_iter().map(|b| b.0).collect();
        assert_eq!(ends, [1, 2, 3]);
        assert_eq!(segs("th", 1, "ทุกสองสัปดาห์").len(), 3);
        assert!(segs("en", 0, "").is_empty());
    }
}
