//! formatToParts: ICU4X's nested `Part`s flattened to typed segments, packed into one string so
//! the JS shell builds the part objects itself (JSI array writes would hit tainted setters).

use core::fmt;
use writeable::{Part, PartsWrite, Writeable};

// Part kinds, shared with js/bootstrap.js PART_TYPES.
pub const LITERAL: u8 = 0;
pub const INTEGER: u8 = 1;
pub const GROUP: u8 = 2;
pub const DECIMAL: u8 = 3;
pub const FRACTION: u8 = 4;
pub const ELEMENT: u8 = 5;

fn kind(p: &Part) -> Option<u8> {
    use icu::decimal::parts as d;
    Some(match *p {
        d::INTEGER => INTEGER,
        d::GROUP => GROUP,
        d::DECIMAL => DECIMAL,
        d::FRACTION => FRACTION,
        icu::list::parts::ELEMENT => ELEMENT,
        _ => return None, // literals and containers
    })
}

#[derive(Default)]
struct Sink {
    out: String,
    spans: Vec<(usize, usize, u8, usize)>, // start, end, kind, depth
    depth: usize,
}

impl fmt::Write for Sink {
    fn write_str(&mut self, s: &str) -> fmt::Result {
        self.out.push_str(s);
        Ok(())
    }
}

impl PartsWrite for Sink {
    type SubPartsWrite = Self;
    fn with_part(
        &mut self,
        part: Part,
        mut f: impl FnMut(&mut Self) -> fmt::Result,
    ) -> fmt::Result {
        let start = self.out.len();
        self.depth += 1;
        f(self)?;
        self.depth -= 1;
        if let Some(k) = kind(&part) {
            self.spans.push((start, self.out.len(), k, self.depth));
        }
        Ok(())
    }
}

/// Flat (kind, text) segments: each byte takes its deepest known part, the rest is literal.
pub fn segments(w: &impl Writeable) -> Vec<(u8, String)> {
    let mut sink = Sink::default();
    let _ = w.write_to_parts(&mut sink);
    let mut by_byte = vec![(LITERAL, 0usize); sink.out.len()];
    for (s, e, k, d) in sink.spans {
        for b in &mut by_byte[s..e] {
            if d + 1 > b.1 {
                *b = (k, d + 1);
            }
        }
    }
    let mut segs: Vec<(u8, String)> = Vec::new();
    let mut start = 0;
    for i in 1..=by_byte.len() {
        let boundary = i == by_byte.len() || by_byte[i].0 != by_byte[start].0;
        if boundary && sink.out.is_char_boundary(start) && sink.out.is_char_boundary(i) {
            segs.push((by_byte[start].0, sink.out[start..i].to_owned()));
            start = i;
        }
    }
    segs
}

/// The count, each kind, each UTF-16 length, then the text. Numbers are two 15-bit UTF-16 units
/// (high, low): up to 2^30 fits and no unit is a surrogate.
pub fn pack(segs: &[(u8, String)]) -> String {
    let mut s = String::new();
    let num = |s: &mut String, v: usize| {
        for unit in [(v >> 15) & 0x7FFF, v & 0x7FFF] {
            s.push(char::from_u32(unit as u32).unwrap_or('\0'));
        }
    };
    num(&mut s, segs.len());
    segs.iter().for_each(|(k, _)| num(&mut s, *k as usize));
    segs.iter()
        .for_each(|(_, t)| num(&mut s, t.encode_utf16().count()));
    segs.iter().for_each(|(_, t)| s.push_str(t));
    s
}

#[cfg(test)]
mod tests {
    #[test]
    fn pack_long_parts() {
        let long = "x".repeat(70_000);
        let packed = super::pack(&[
            (super::ELEMENT, long.clone()),
            (super::LITERAL, ", ".into()),
        ]);
        let units: Vec<u16> = packed.encode_utf16().collect();
        let num = |i: usize| ((units[i] as usize) << 15) | units[i + 1] as usize;
        assert_eq!(num(0), 2);
        assert_eq!(num(6), 70_000); // count (2 units) + 2 kinds (4 units), then the first length
        assert_eq!(units.len(), 2 + 4 + 4 + 70_002);
    }
}
