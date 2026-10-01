const path = require('path');

// Autolink hermes-intl from the repository root, as if it were installed from npm.
module.exports = {
  dependencies: {
    'hermes-intl': { root: path.resolve(__dirname, '..') },
  },
};
