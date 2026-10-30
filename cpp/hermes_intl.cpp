#include "hermes_intl.h"

#include "hermes_intl_core.h"

#include <memory>
#include <unordered_map>
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
#ifdef __APPLE__
using NumberFormatState = Owned<HiNumberFormat, hi_nf_free>;
#endif

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

// The host functions as a HostObject: react-native-worklets passes HostObjects to its runtimes by
// reference, and each function is made in the runtime that reads it. Read-only once built, so
// safe to read from any runtime's thread.
struct Native : HostObject {
  std::string defaultLocale;
  std::unordered_map<std::string, std::pair<unsigned, HostFunctionType>> functions;

  Value get(Runtime &rt, const PropNameID &name) override {
    std::string n = name.utf8(rt);
    if (n == "defaultLocale") return String::createFromUtf8(rt, defaultLocale);
    auto f = functions.find(n);
    if (f == functions.end()) return Value::undefined();
    return Function::createFromHostFunction(rt, name, f->second.first, f->second.second);
  }

  std::vector<PropNameID> getPropertyNames(Runtime &rt) override {
    std::vector<PropNameID> names;
    names.push_back(PropNameID::forAscii(rt, "defaultLocale"));
    for (auto &f : functions) names.push_back(PropNameID::forUtf8(rt, f.first));
    return names;
  }
};

void def(Runtime &, Native &o, const char *name, unsigned length, HostFunctionType f) {
  o.functions.emplace(name, std::make_pair(length, std::move(f)));
}

uint8_t u8(const Value &v) { return static_cast<uint8_t>(v.getNumber()); }

// The 11 digit options after the locale, as the bootstrap passes them to prNew and nfNew.
HiPluralOptions pluralOptions(const Value *a) {
  return {a[0].getBool(), u8(a[1]), a[2].getBool(), u8(a[3]), u8(a[4]), u8(a[5]), u8(a[6]),
          u8(a[7]),       static_cast<uint16_t>(a[8].getNumber()), u8(a[9]), a[10].getBool()};
}

} // namespace

Object createNative(Runtime &rt, const std::string &hostLocale) {
  auto host = std::make_shared<Native>();
  Native &native = *host;

  def(rt, native, "canonicalize", 1, [](Runtime &rt, const Value &, const Value *a, size_t) {
    return tagCall(rt, hi_canonicalize, a[0]);
  });
  def(rt, native, "lookup", 1, [](Runtime &rt, const Value &, const Value *a, size_t) {
    return tagCall(rt, hi_lookup, a[0]);
  });
  HiStr locale = hi_default_locale(hostLocale.data(), hostLocale.size());
  native.defaultLocale.assign(locale.ptr, locale.len);
  hi_str_free(locale);

  def(rt, native, "prNew", 12, [](Runtime &rt, const Value &, const Value *a, size_t) {
    std::string locale = a[0].getString(rt).utf8(rt);
    HiPluralOptions o = pluralOptions(a + 1);
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

#ifdef __APPLE__
  // Intl.NumberFormat: the digit options as for prNew, then style, currency, currencyDisplay,
  // accounting, unit, unitDisplay, useGrouping, signDisplay, minimumIntegerDigits.
  def(rt, native, "nfNew", 21, [](Runtime &rt, const Value &, const Value *a, size_t) {
    std::string locale = a[0].getString(rt).utf8(rt);
    HiNumberOptions o{};
    o.digits = pluralOptions(a + 1);
    o.style = u8(a[12]);
    std::string currency = a[13].getString(rt).utf8(rt);
    for (size_t i = 0; i < 3 && i < currency.size(); i++) o.currency[i] = currency[i];
    o.currency_display = u8(a[14]);
    o.accounting = a[15].getBool();
    std::string unit = a[16].getString(rt).utf8(rt);
    o.unit_display = u8(a[17]);
    o.grouping = u8(a[18]);
    o.sign_display = u8(a[19]);
    o.min_integer = u8(a[20]);
    return handleFor<NumberFormatState>(
        rt, hi_nf_new(locale.data(), locale.size(), &o, unit.data(), unit.size()), "Intl.NumberFormat");
  });
  def(rt, native, "nfFormat", 3, [](Runtime &rt, const Value &, const Value *a, size_t) {
    std::string s;
    HiNumber x = toNumber(rt, a[1], s);
    Value v = take(rt, hi_nf_format(unwrap<NumberFormatState>(rt, a[0]), &x, a[2].getBool()));
    if (v.isUndefined()) throw JSError(rt, "Intl.NumberFormat: formatting failed");
    return v;
  });
  def(rt, native, "nfFormatRange", 4, [](Runtime &rt, const Value &, const Value *a, size_t) {
    std::string s1, s2;
    HiNumber x = toNumber(rt, a[1], s1), y = toNumber(rt, a[2], s2);
    Value v = take(rt, hi_nf_format_range(unwrap<NumberFormatState>(rt, a[0]), &x, &y, a[3].getBool()));
    if (v.isUndefined()) throw JSError(rt, "Intl.NumberFormat: formatting failed");
    return v;
  });
  def(rt, native, "currencyDigits", 1, [](Runtime &rt, const Value &, const Value *a, size_t) {
    std::string code = a[0].getString(rt).utf8(rt);
    return Value(static_cast<int>(hi_currency_digits(code.data(), code.size())));
  });
#endif

  return Object::createFromHostObject(rt, host);
}

} // namespace hermes_intl
