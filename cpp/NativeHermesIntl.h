#pragma once

#include <HermesIntlSpecJSI.h>
#include <hermes_intl.h>

#ifdef __APPLE__
#include <CoreFoundation/CoreFoundation.h>
#endif

namespace facebook::react {

class NativeHermesIntl : public NativeHermesIntlCxxSpec<NativeHermesIntl> {
 public:
  explicit NativeHermesIntl(std::shared_ptr<CallInvoker> jsInvoker)
      : NativeHermesIntlCxxSpec(std::move(jsInvoker)) {}

  // `hostLocale` comes from I18nManager, which only reports it on Android.
  jsi::Object install(jsi::Runtime &rt, std::string hostLocale) {
    return hermes_intl::createNative(rt, hostLocale.empty() ? preferredLanguage() : hostLocale);
  }

 private:
  static std::string preferredLanguage() {
#ifdef __APPLE__
    std::string tag;
    CFArrayRef languages = CFLocaleCopyPreferredLanguages();
    if (CFArrayGetCount(languages) > 0) {
      char buf[128];
      auto first = static_cast<CFStringRef>(CFArrayGetValueAtIndex(languages, 0));
      if (CFStringGetCString(first, buf, sizeof buf, kCFStringEncodingUTF8)) tag = buf;
    }
    CFRelease(languages);
    return tag;
#else
    return {};
#endif
  }
};

} // namespace facebook::react
