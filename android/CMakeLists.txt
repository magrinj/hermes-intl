# Added to the app's native build by React Native autolinking (react-native.config.js).
cmake_minimum_required(VERSION 3.13)
project(hermesintl CXX)

set(HERMES_INTL_ROOT ${CMAKE_CURRENT_LIST_DIR}/..)

# The Rust/ICU4X core, prebuilt per ABI (scripts/build-prebuilt.sh). AGP packages imported
# shared libraries it links against.
add_library(hermes_intl_core SHARED IMPORTED)
set_target_properties(hermes_intl_core PROPERTIES
  IMPORTED_LOCATION ${HERMES_INTL_ROOT}/prebuilt/android/${ANDROID_ABI}/libhermes_intl.so)

add_library(hermesintl STATIC ${HERMES_INTL_ROOT}/cpp/hermes_intl.cpp)
target_include_directories(hermesintl PUBLIC ${HERMES_INTL_ROOT}/cpp)
target_compile_features(hermesintl PRIVATE cxx_std_20)
target_link_libraries(hermesintl ReactAndroid::jsi react_codegen_HermesIntlSpec hermes_intl_core)
