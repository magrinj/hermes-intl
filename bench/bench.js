// Host: prints the suite (load after suite.js). Needs hi-host's print() and __now().
hermesIntlBench(__now).forEach(function (r) { print(r[0] + ': ' + r[1]); });
