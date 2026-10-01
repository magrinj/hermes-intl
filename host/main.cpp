// Test host: a Hermes runtime with hermes-intl installed, evaluating the given JS files in order
// (test262 harness files first, then the test). Exit 0 = all evaluated cleanly.
//   hi-host [--locale en-US] [--strict] file.js...
// Globals: print(...), __now() (ms, steady clock).
#include "hermes_intl.h"

#include <hermes/hermes.h>

#include <chrono>
#include <cstdio>
#include <fstream>
#include <iostream>
#include <sstream>

using namespace facebook::jsi;

static std::string readFile(const char *path) {
  std::ifstream f(path, std::ios::binary);
  if (!f) throw std::runtime_error(std::string("cannot read ") + path);
  std::stringstream ss;
  ss << f.rdbuf();
  return ss.str();
}

int main(int argc, char **argv) {
  std::string locale = "en-US";
  bool strict = false;
  int i = 1;
  for (; i < argc && argv[i][0] == '-' && argv[i][1] == '-'; i++) {
    std::string a = argv[i];
    if (a == "--locale" && i + 1 < argc) locale = argv[++i];
    else if (a == "--strict") strict = true;
  }

  auto rt = facebook::hermes::makeHermesRuntime(
      ::hermes::vm::RuntimeConfig::Builder().withES6Proxy(true).withMicrotaskQueue(true).build());
  rt->global().setProperty(*rt, "print", Function::createFromHostFunction(*rt, PropNameID::forAscii(*rt, "print"), 1,
      [](Runtime &rt, const Value &, const Value *args, size_t n) {
        for (size_t k = 0; k < n; k++) std::cout << (k ? " " : "") << args[k].toString(rt).utf8(rt);
        std::cout << std::endl;
        return Value::undefined();
      }));
  rt->global().setProperty(*rt, "__now", Function::createFromHostFunction(*rt, PropNameID::forAscii(*rt, "__now"), 0,
      [](Runtime &, const Value &, const Value *, size_t) {
        using namespace std::chrono;
        return Value(duration<double, std::milli>(steady_clock::now().time_since_epoch()).count());
      }));

  try {
    // What src/index.js does in an app: js/bootstrap.js (a CommonJS module) called on the host functions.
    std::string bootstrap = "(function (module) {\n" + readFile(HERMES_INTL_BOOTSTRAP) + "\nreturn module.exports;\n})({})";
    rt->evaluateJavaScript(std::make_shared<StringBuffer>(std::move(bootstrap)), "js/bootstrap.js")
        .getObject(*rt)
        .getFunction(*rt)
        .call(*rt, hermes_intl::createNative(*rt, locale), rt->global());
    for (; i < argc; i++) {
      std::string src = readFile(argv[i]);
      if (strict) src = "'use strict';\n" + src;
      rt->evaluateJavaScript(std::make_shared<StringBuffer>(std::move(src)), argv[i]);
      rt->drainMicrotasks();
    }
  } catch (const JSError &e) {
    std::cout << "FAIL " << e.getMessage() << "\n" << e.getStack() << std::endl;
    return 1;
  } catch (const std::exception &e) {
    std::cout << "FAIL " << e.what() << std::endl;
    return 1;
  }
  return 0;
}
