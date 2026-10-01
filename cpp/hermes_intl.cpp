#include "hermes_intl.h"

#include "hermes_intl_core.h"

#include <memory>
#include <vector>

using namespace facebook::jsi;

namespace hermes_intl {
namespace {

// Owns one Rust object for the lifetime of the JS handle object it is attached to.
template <class T, void (*Free)(T *)>
struct Owned : NativeState {
  explicit Owned(T *p) : ptr(p) {}
  ~Owned() override { Free(ptr); }
  T *ptr;
};
using PluralRulesState = Owned<HiPluralRules, hi_pr_free>;
using RelativeTimeFormatState = Owned<HiRelativeTimeFormat, hi_rtf_free>;
using ListFormatState = Owned<HiListFormat, hi_lf_free>;

template <class S>
Value handleFor(Runtime &rt, decltype(S::ptr) p, const char *what) {
  if (!p) throw JSError(rt, std::string(what) + ": no data for this locale");
  Object handle(rt);
  handle.setNativeState(rt, std::make_shared<S>(p));
  return Value(rt, handle);
}

template <class S>
decltype(S::ptr) unwrap(Runtime &rt, const Value &handle) {
  return handle.getObject(rt).getNativeState<S>(rt)->ptr;
}

// Takes ownership of a Rust string; undefined when it is empty-handed.
Value take(Runtime &rt, HiStr s) {
  if (!s.ptr) return Value::undefined();
  std::unique_ptr<HiStr, void (*)(HiStr *)> owner(&s, [](HiStr *p) { hi_str_free(*p); });
  return String::createFromUtf8(rt, reinterpret_cast<const uint8_t *>(s.ptr), s.len);
}

using TagFn = HiStr (*)(const char *, size_t);
Value tagCall(Runtime &rt, TagFn f, const Value &arg) {
  std::string in = arg.getString(rt).utf8(rt);
  return take(rt, f(in.data(), in.size()));
}

// The bootstrap passes a Number or a normalized decimal literal string.
HiNumber toNumber(Runtime &rt, const Value &v, std::string &storage) {
  if (v.isNumber()) return {v.getNumber(), nullptr, 0};
  storage = v.getString(rt).utf8(rt);
  return {0, storage.data(), storage.size()};
}

void def(Runtime &rt, Object &o, const char *name, unsigned length, HostFunctionType f) {
  o.setProperty(rt, name, Function::createFromHostFunction(rt, PropNameID::forAscii(rt, name), length, std::move(f)));
}

uint8_t u8(const Value &v) { return static_cast<uint8_t>(v.getNumber()); }

} // namespace

Object createNative(Runtime &rt, const std::string &hostLocale) {
  Object native(rt);

  def(rt, native, "canonicalize", 1, [](Runtime &rt, const Value &, const Value *a, size_t) {
    return tagCall(rt, hi_canonicalize, a[0]);
  });
  def(rt, native, "lookup", 1, [](Runtime &rt, const Value &, const Value *a, size_t) {
    return tagCall(rt, hi_lookup, a[0]);
  });
  native.setProperty(rt, "defaultLocale", take(rt, hi_default_locale(hostLocale.data(), hostLocale.size())));

  def(rt, native, "prNew", 12, [](Runtime &rt, const Value &, const Value *a, size_t) {
    std::string locale = a[0].getString(rt).utf8(rt);
    HiPluralOptions o{
        a[1].getBool(), u8(a[2]), a[3].getBool(), u8(a[4]), u8(a[5]), u8(a[6]), u8(a[7]),
        u8(a[8]),       static_cast<uint16_t>(a[9].getNumber()), u8(a[10]), a[11].getBool()};
    return handleFor<PluralRulesState>(rt, hi_pr_new(locale.data(), locale.size(), &o), "Intl.PluralRules");
  });
  def(rt, native, "prCategories", 1, [](Runtime &rt, const Value &, const Value *a, size_t) {
    return Value(static_cast<int>(hi_pr_categories(unwrap<PluralRulesState>(rt, a[0]))));
  });
  def(rt, native, "prSelect", 2, [](Runtime &rt, const Value &, const Value *a, size_t) {
    std::string s;
    HiNumber x = toNumber(rt, a[1], s);
    return Value(static_cast<int>(hi_pr_select(unwrap<PluralRulesState>(rt, a[0]), &x)));
  });
  def(rt, native, "prSelectRange", 3, [](Runtime &rt, const Value &, const Value *a, size_t) {
    std::string s1, s2;
    HiNumber x = toNumber(rt, a[1], s1), y = toNumber(rt, a[2], s2);
    return Value(static_cast<int>(hi_pr_select_range(unwrap<PluralRulesState>(rt, a[0]), &x, &y)));
  });

  // Intl.Locale
  def(rt, native, "localeMaximize", 1, [](Runtime &rt, const Value &, const Value *a, size_t) {
    return tagCall(rt, hi_locale_maximize, a[0]);
  });
  def(rt, native, "localeMinimize", 1, [](Runtime &rt, const Value &, const Value *a, size_t) {
    return tagCall(rt, hi_locale_minimize, a[0]);
  });
  def(rt, native, "localeNumberingSystem", 1, [](Runtime &rt, const Value &, const Value *a, size_t) {
    return tagCall(rt, hi_locale_numbering_system, a[0]);
  });
  def(rt, native, "regionTimeZones", 1, [](Runtime &rt, const Value &, const Value *a, size_t) {
    return tagCall(rt, hi_region_time_zones, a[0]);
  });
  def(rt, native, "localeDirection", 1, [](Runtime &rt, const Value &, const Value *a, size_t) {
    std::string t = a[0].getString(rt).utf8(rt);
    return Value(static_cast<int>(hi_locale_direction(t.data(), t.size())));
  });
  def(rt, native, "localeWeekInfo", 1, [](Runtime &rt, const Value &, const Value *a, size_t) {
    std::string t = a[0].getString(rt).utf8(rt);
    return Value(static_cast<int>(hi_locale_week_info(t.data(), t.size())));
  });
  def(rt, native, "numberingSystemSupported", 1, [](Runtime &rt, const Value &, const Value *a, size_t) {
    std::string t = a[0].getString(rt).utf8(rt);
    return Value(hi_numbering_system_supported(t.data(), t.size()));
  });

  // Intl.RelativeTimeFormat
  def(rt, native, "rtfNew", 3, [](Runtime &rt, const Value &, const Value *a, size_t) {
    std::string locale = a[0].getString(rt).utf8(rt);
    return handleFor<RelativeTimeFormatState>(
        rt, hi_rtf_new(locale.data(), locale.size(), u8(a[1]), a[2].getBool()), "Intl.RelativeTimeFormat");
  });
  def(rt, native, "rtfFormat", 4, [](Runtime &rt, const Value &, const Value *a, size_t) {
    Value v = take(rt, hi_rtf_format(unwrap<RelativeTimeFormatState>(rt, a[0]), a[1].getNumber(), u8(a[2]), a[3].getBool()));
    if (v.isUndefined()) throw JSError(rt, "Intl.RelativeTimeFormat: formatting failed");
    return v;
  });

  // Intl.ListFormat
  def(rt, native, "lfNew", 3, [](Runtime &rt, const Value &, const Value *a, size_t) {
    std::string locale = a[0].getString(rt).utf8(rt);
    return handleFor<ListFormatState>(rt, hi_lf_new(locale.data(), locale.size(), u8(a[1]), u8(a[2])), "Intl.ListFormat");
  });
  def(rt, native, "lfFormat", 3, [](Runtime &rt, const Value &, const Value *a, size_t) {
    Array list = a[1].getObject(rt).getArray(rt);
    size_t n = list.size(rt);
    std::vector<std::string> items(n);
    std::vector<HiSlice> slices(n);
    for (size_t i = 0; i < n; i++) {
      items[i] = list.getValueAtIndex(rt, i).getString(rt).utf8(rt);
      slices[i] = {items[i].data(), items[i].size()};
    }
    return take(rt, hi_lf_format(unwrap<ListFormatState>(rt, a[0]), slices.data(), n, a[2].getBool()));
  });

  return native;
}

} // namespace hermes_intl
