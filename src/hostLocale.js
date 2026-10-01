// Android reports Java's Locale.toString() ("zh_CN_#Hans"), not a BCP 47 tag; Apple ids look like "zh_Hans_CN@calendar=x".
function toBcp47(identifier) {
  const [language, ...rest] = String(identifier || '').split('@')[0].split('_').filter(Boolean);
  const script = rest.map(part => /^#?([A-Za-z]{4})$/.exec(part)).find(Boolean);
  const region = rest.find(part => /^([A-Za-z]{2}|\d{3})$/.test(part));
  return [language, script && script[1], region].filter(Boolean).join('-');
}

module.exports = { toBcp47 };
