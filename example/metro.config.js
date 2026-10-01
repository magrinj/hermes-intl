const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const root = path.resolve(__dirname, '..');
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// hermes-intl is resolved from the repository root (see react-native.config.js for autolinking),
// so edits to src/ and js/ show up without reinstalling. bench/ is also read from the root.
const config = {
  watchFolders: [root],
  resolver: {
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
    extraNodeModules: { 'hermes-intl': root },
    // The root node_modules holds release tooling and, via peer dependencies, a second react-native.
    blockList: ['node_modules', 'vendor', 'rust/target', 'host/build', 'bench/node_modules'].map(
      dir => new RegExp('^' + escape(path.join(root, dir)) + '/.*'),
    ),
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
