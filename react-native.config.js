// NativeHermesIntl is a C++ TurboModule: Android autolinking adds android/CMakeLists.txt to the
// app's native build and registers the module in its C++ module provider.
module.exports = {
  dependency: {
    platforms: {
      android: {
        cxxModuleCMakeListsModuleName: 'hermesintl',
        cxxModuleCMakeListsPath: 'CMakeLists.txt',
        cxxModuleHeaderName: 'NativeHermesIntl',
      },
    },
  },
};
