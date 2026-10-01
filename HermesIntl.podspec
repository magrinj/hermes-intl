require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "HermesIntl"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/magrinj/hermes-intl"
  s.license      = package["license"]
  s.authors      = package["author"]
  s.platforms    = { :ios => "15.1" }
  s.source       = { :git => "https://github.com/magrinj/hermes-intl.git", :tag => "v#{s.version}" }

  s.source_files = "cpp/*.{h,cpp}", "ios/*.{h,mm}"
  s.private_header_files = "cpp/hermes_intl_core.h"
  s.frameworks = "CoreFoundation"
  # The Rust/ICU4X core (scripts/build-prebuilt.sh).
  s.vendored_frameworks = "prebuilt/ios/HermesIntlCore.xcframework"

  install_modules_dependencies(s)
end
