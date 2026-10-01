// The shared suite and corpus from ../../bench, same code as the host run: the corpus hash must match.
require('../../bench/suite.js');
require('../../bench/corpus.js');

export function runBench() {
  const rows = [
    ['implementation', global.__demo.impl],
    ['setup', global.__demo.setupMs.toFixed(2) + ' ms'],
    ['default locale', new Intl.RelativeTimeFormat().resolvedOptions().locale],
  ];
  rows.push(...global.hermesIntlBench(() => performance.now()));
  try {
    const lines = global.hermesIntlCorpus();
    rows.push(['corpus', lines.length + ' lines, hash ' + global.hermesIntlHash(lines)]);
  } catch (e) {
    rows.push(['corpus', 'threw: ' + e.message]);
  }
  console.log('HERMES_INTL_BENCH ' + JSON.stringify(rows));
  return rows;
}
