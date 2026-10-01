# macOS test host: vendor/hermes (built in vendor/hermes-build) + cpp/ + the Rust core.
cmake_minimum_required(VERSION 3.20)
project(hermes_intl_host CXX)
set(CMAKE_CXX_STANDARD 20)

set(ROOT ${CMAKE_CURRENT_SOURCE_DIR}/..)
set(HERMES_SRC ${ROOT}/vendor/hermes)
set(HERMES_BUILD ${ROOT}/vendor/hermes-build)
# Built by ../scripts/test262.sh with the test locale list.
set(RUST_LIB ${ROOT}/rust/target/release/libhermes_intl.a)

add_executable(hi-host main.cpp ${ROOT}/cpp/hermes_intl.cpp)
target_compile_definitions(hi-host PRIVATE HERMES_INTL_BOOTSTRAP="${ROOT}/js/bootstrap.js")
target_include_directories(hi-host PRIVATE ${ROOT}/cpp ${HERMES_SRC}/API ${HERMES_SRC}/API/jsi ${HERMES_SRC}/public)
target_link_libraries(hi-host PRIVATE ${RUST_LIB} ${HERMES_BUILD}/lib/libhermesvm.dylib)
set_target_properties(hi-host PROPERTIES BUILD_RPATH ${HERMES_BUILD}/lib)
