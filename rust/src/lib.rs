//! C ABI mirrored by cpp/hermes_intl_core.h. Every `unsafe extern` fn requires pointers valid for
//! their lengths (or null with length 0) and handles from the matching `*_new`, freed once.
#![allow(clippy::missing_safety_doc)]

pub mod list;
pub mod locale;
pub mod parts;
pub mod plural;
pub mod relativetime;

use core::ffi::c_char;
use icu::list::ListFormatter;
use plural::{Options, Rules};
use relativetime::RelativeTimeFormat;

unsafe fn str<'a>(p: *const c_char, len: usize) -> &'a str {
    if p.is_null() {
        return "";
    }
    core::str::from_utf8(core::slice::from_raw_parts(p as *const u8, len)).unwrap_or("")
}

/// Canonical form of a language tag; null if it is not well-formed.
#[no_mangle]
pub unsafe extern "C" fn hi_canonicalize(tag: *const c_char, len: usize) -> HiStr {
    owned(locale::canonicalize(str(tag, len)))
}

/// Best available locale for a canonical tag; null if none.
#[no_mangle]
pub unsafe extern "C" fn hi_lookup(tag: *const c_char, len: usize) -> HiStr {
    owned(locale::lookup(str(tag, len)))
}

#[no_mangle]
pub unsafe extern "C" fn hi_default_locale(host: *const c_char, len: usize) -> HiStr {
    owned(Some(locale::default_locale(str(host, len))))
}

/// A JS numeric argument: `s` (UTF-8 decimal literal, `len` bytes) when non-null, else `f`.
#[repr(C)]
pub struct HiNumber {
    pub f: f64,
    pub s: *const c_char,
    pub len: usize,
}

unsafe fn decimal(n: &HiNumber) -> Option<fixed_decimal::Decimal> {
    if n.s.is_null() {
        plural::from_f64(n.f)
    } else {
        plural::from_str(str(n.s, n.len))
    }
}

/// Null if the locale has no data.
#[no_mangle]
pub unsafe extern "C" fn hi_pr_new(
    locale: *const c_char,
    len: usize,
    o: *const Options,
) -> *mut Rules {
    Rules::new(str(locale, len), *o).map_or(core::ptr::null_mut(), |r| Box::into_raw(Box::new(r)))
}

#[no_mangle]
pub unsafe extern "C" fn hi_pr_free(r: *mut Rules) {
    if !r.is_null() {
        drop(Box::from_raw(r));
    }
}

/// Bitmask over zero, one, two, few, many, other.
#[no_mangle]
pub unsafe extern "C" fn hi_pr_categories(r: *const Rules) -> u8 {
    (*r).categories()
}

fn index(c: icu::plurals::PluralCategory) -> u8 {
    plural::ALL.iter().position(|a| *a == c).unwrap_or(5) as u8
}

/// Category index (0 zero … 5 other).
#[no_mangle]
pub unsafe extern "C" fn hi_pr_select(r: *const Rules, x: *const HiNumber) -> u8 {
    index((*r).select(decimal(&*x)))
}

#[no_mangle]
pub unsafe extern "C" fn hi_pr_select_range(
    r: *const Rules,
    x: *const HiNumber,
    y: *const HiNumber,
) -> u8 {
    index((*r).select_range(decimal(&*x), decimal(&*y)))
}

/// A Rust-owned UTF-8 string; `ptr` null = no result. Free with `hi_str_free`.
#[repr(C)]
pub struct HiStr {
    pub ptr: *mut c_char,
    pub len: usize,
}

fn owned(s: Option<String>) -> HiStr {
    match s {
        Some(s) => {
            let b = s.into_bytes().into_boxed_slice();
            let len = b.len();
            HiStr {
                ptr: Box::into_raw(b) as *mut c_char,
                len,
            }
        }
        None => HiStr {
            ptr: core::ptr::null_mut(),
            len: 0,
        },
    }
}

#[no_mangle]
pub unsafe extern "C" fn hi_str_free(s: HiStr) {
    if !s.ptr.is_null() {
        drop(Box::from_raw(core::ptr::slice_from_raw_parts_mut(
            s.ptr as *mut u8,
            s.len,
        )));
    }
}

#[no_mangle]
pub unsafe extern "C" fn hi_locale_maximize(tag: *const c_char, len: usize) -> HiStr {
    owned(locale::maximize(str(tag, len)))
}

#[no_mangle]
pub unsafe extern "C" fn hi_locale_minimize(tag: *const c_char, len: usize) -> HiStr {
    owned(locale::minimize(str(tag, len)))
}

/// 0 ltr, 1 rtl, 2 unknown.
#[no_mangle]
pub unsafe extern "C" fn hi_locale_direction(tag: *const c_char, len: usize) -> u8 {
    locale::direction(str(tag, len))
}

/// First day (1 Mon ..= 7 Sun) in the low byte, weekend day d at bit 7 + d.
#[no_mangle]
pub unsafe extern "C" fn hi_locale_week_info(tag: *const c_char, len: usize) -> u16 {
    locale::week_info(str(tag, len))
}

#[no_mangle]
pub unsafe extern "C" fn hi_locale_numbering_system(tag: *const c_char, len: usize) -> HiStr {
    owned(Some(locale::default_numbering_system(str(tag, len))))
}

#[no_mangle]
pub unsafe extern "C" fn hi_numbering_system_supported(nu: *const c_char, len: usize) -> bool {
    locale::numbering_system_supported(str(nu, len))
}

/// Space-separated canonical IANA ids for a region.
#[no_mangle]
pub unsafe extern "C" fn hi_region_time_zones(region: *const c_char, len: usize) -> HiStr {
    owned(Some(locale::time_zones(str(region, len))))
}

/// `style`: 0 long, 1 short, 2 narrow. Null if the locale does not parse.
#[no_mangle]
pub unsafe extern "C" fn hi_rtf_new(
    locale: *const c_char,
    len: usize,
    style: u8,
    auto: bool,
) -> *mut RelativeTimeFormat {
    RelativeTimeFormat::new(str(locale, len), style, auto)
        .map_or(core::ptr::null_mut(), |f| Box::into_raw(Box::new(f)))
}

#[no_mangle]
pub unsafe extern "C" fn hi_rtf_free(f: *mut RelativeTimeFormat) {
    if !f.is_null() {
        drop(Box::from_raw(f));
    }
}

/// `unit` 0 second ..= 7 year; `value` finite. `packed` = formatToParts encoding (parts.rs).
#[no_mangle]
pub unsafe extern "C" fn hi_rtf_format(
    f: *const RelativeTimeFormat,
    value: f64,
    unit: u8,
    packed: bool,
) -> HiStr {
    let f = &*f;
    owned(if packed {
        f.segments(value, unit).map(|s| parts::pack(&s))
    } else {
        f.format(value, unit)
    })
}

/// `kind`: 0 conjunction, 1 disjunction, 2 unit; `style`: 0 long, 1 short, 2 narrow.
#[no_mangle]
pub unsafe extern "C" fn hi_lf_new(
    locale: *const c_char,
    len: usize,
    kind: u8,
    style: u8,
) -> *mut ListFormatter {
    list::new(str(locale, len), kind, style)
        .map_or(core::ptr::null_mut(), |f| Box::into_raw(Box::new(f)))
}

#[no_mangle]
pub unsafe extern "C" fn hi_lf_free(f: *mut ListFormatter) {
    if !f.is_null() {
        drop(Box::from_raw(f));
    }
}

#[repr(C)]
pub struct HiSlice {
    pub ptr: *const c_char,
    pub len: usize,
}

#[no_mangle]
pub unsafe extern "C" fn hi_lf_format(
    f: *const ListFormatter,
    items: *const HiSlice,
    n: usize,
    packed: bool,
) -> HiStr {
    // An empty C++ vector may hand over a null pointer; from_raw_parts needs non-null even for 0.
    let items: Vec<&str> = if n == 0 {
        Vec::new()
    } else {
        core::slice::from_raw_parts(items, n)
            .iter()
            .map(|s| str(s.ptr, s.len))
            .collect()
    };
    let f = &*f;
    owned(Some(if packed {
        parts::pack(&list::segments(f, &items))
    } else {
        f.format_to_string(items.iter())
    }))
}
