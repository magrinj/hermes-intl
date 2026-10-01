const assert = require('node:assert/strict');
const { test } = require('node:test');
const { toBcp47 } = require('../src/hostLocale');

const cases = {
  'zh_CN_#Hans': 'zh-Hans-CN',
  'zh_TW_#Hant': 'zh-Hant-TW',
  'sr_RS_#Latn': 'sr-Latn-RS',
  'sr__#Latn': 'sr-Latn',
  'az_AZ_#Latn': 'az-Latn-AZ',
  'th_TH_TH_#u-nu-thai': 'th-TH',
  'en_US': 'en-US',
  'en_US_POSIX': 'en-US',
  'no_NO_NY': 'no-NO',
  'de__POSIX': 'de',
  'es_419': 'es-419',
  'zh_Hans_CN@calendar=chinese': 'zh-Hans-CN',
  'fr-FR': 'fr-FR',
  'zh-Hans-CN': 'zh-Hans-CN',
  'fr': 'fr',
  '': '',
};

for (const [identifier, expected] of Object.entries(cases)) {
  test(`${JSON.stringify(identifier)} -> ${JSON.stringify(expected)}`, () => {
    assert.equal(toBcp47(identifier), expected);
  });
}

test('missing identifiers give an empty string', () => {
  assert.equal(toBcp47(undefined), '');
  assert.equal(toBcp47(null), '');
});
