// Host: prints the corpus (load after corpus.js).
hermesIntlCorpus().forEach(function (l) { print(l); });
print("hash " + hermesIntlHash(hermesIntlCorpus()));
