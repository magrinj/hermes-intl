// C ABI of the Rust core (rust/src/lib.rs). Keep in sync by hand.
#pragma once
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// Rust-owned string; ptr NULL = no result. Always pass back to hi_str_free.
typedef struct {
  char *ptr;
  size_t len;
} HiStr;
void hi_str_free(HiStr s);

HiStr hi_canonicalize(const char *tag, size_t len);    // NULL if not well-formed
HiStr hi_lookup(const char *tag, size_t len);          // NULL if no available locale matches
HiStr hi_default_locale(const char *host, size_t len);

typedef struct HiPluralRules HiPluralRules;

typedef struct {
  bool ordinal;
  uint8_t notation;         // 0 standard, 1 scientific, 2 engineering, 3 compact
  bool compact_long;
  uint8_t min_fraction;
  uint8_t max_fraction;
  uint8_t min_significant;
  uint8_t max_significant;
  uint8_t rounding_type;    // 0 fraction-digits, 1 significant-digits, 2 more-precision, 3 less-precision
  uint16_t rounding_increment;
  uint8_t rounding_mode;    // ceil floor expand trunc halfCeil halfFloor halfExpand halfTrunc halfEven
  bool strip_if_integer;
} HiPluralOptions;

// A JS numeric argument: `s` (decimal literal, `len` bytes) when non-null, else `f`.
typedef struct {
  double f;
  const char *s;
  size_t len;
} HiNumber;

HiPluralRules *hi_pr_new(const char *locale, size_t len, const HiPluralOptions *o);
void hi_pr_free(HiPluralRules *r);
uint8_t hi_pr_categories(const HiPluralRules *r);  // bitmask over zero..other
uint8_t hi_pr_select(const HiPluralRules *r, const HiNumber *x);  // 0 zero .. 5 other
uint8_t hi_pr_select_range(const HiPluralRules *r, const HiNumber *x, const HiNumber *y);

// Intl.Locale
HiStr hi_locale_maximize(const char *tag, size_t len);
HiStr hi_locale_minimize(const char *tag, size_t len);
uint8_t hi_locale_direction(const char *tag, size_t len);    // 0 ltr, 1 rtl, 2 unknown
uint16_t hi_locale_week_info(const char *tag, size_t len);   // first day in the low byte, weekend day d at bit 7+d
HiStr hi_locale_numbering_system(const char *tag, size_t len);
bool hi_numbering_system_supported(const char *nu, size_t len);
HiStr hi_region_time_zones(const char *region, size_t len);  // space-separated

// Intl.RelativeTimeFormat. style 0 long, 1 short, 2 narrow; unit 0 second .. 7 year.
// packed = formatToParts encoding (rust/src/parts.rs).
typedef struct HiRelativeTimeFormat HiRelativeTimeFormat;
HiRelativeTimeFormat *hi_rtf_new(const char *locale, size_t len, uint8_t style, bool numeric_auto);
void hi_rtf_free(HiRelativeTimeFormat *f);
HiStr hi_rtf_format(const HiRelativeTimeFormat *f, double value, uint8_t unit, bool packed);

// Intl.ListFormat. kind 0 conjunction, 1 disjunction, 2 unit; style 0 long, 1 short, 2 narrow.
typedef struct HiListFormat HiListFormat;
typedef struct {
  const char *ptr;
  size_t len;
} HiSlice;
HiListFormat *hi_lf_new(const char *locale, size_t len, uint8_t kind, uint8_t style);
void hi_lf_free(HiListFormat *f);
HiStr hi_lf_format(const HiListFormat *f, const HiSlice *items, size_t n, bool packed);

#ifdef __cplusplus
}
#endif
