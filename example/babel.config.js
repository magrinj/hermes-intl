module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // Only needed by the FormatJS build: its polyfills use static class blocks.
    '@babel/plugin-transform-class-static-block',
    // Last, as react-native-worklets asks.
    'react-native-worklets/plugin',
  ],
};
