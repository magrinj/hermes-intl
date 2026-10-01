// First import of index.js. Everything else in the app is identical between the two builds.
global.__demoStart = performance.now();
require('hermes-intl');
global.__demo = { impl: 'hermes-intl', subtitle: 'native Intl (ICU4X)', color: '#0a7d32', setupMs: performance.now() - global.__demoStart };
