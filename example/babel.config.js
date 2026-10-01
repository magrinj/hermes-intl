module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // Only needed by the FormatJS build: its polyfills use static class blocks.
  plugins: ['@babel/plugin-transform-class-static-block'],
};
