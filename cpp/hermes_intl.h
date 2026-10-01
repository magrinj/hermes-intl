#pragma once
#include <jsi/jsi.h>
#include <string>

namespace hermes_intl {

// The host functions js/bootstrap.js builds the Intl constructors on. `hostLocale` is the
// device's BCP 47 locale (DefaultLocale).
facebook::jsi::Object createNative(facebook::jsi::Runtime &rt, const std::string &hostLocale);

} // namespace hermes_intl
