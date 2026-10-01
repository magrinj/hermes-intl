module.exports = {
  root: true,
  extends: '@react-native',
  globals: { performance: 'readonly' }, // React Native provides it; the template config does not know.
};
