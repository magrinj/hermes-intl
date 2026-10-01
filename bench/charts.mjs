// Writes the README charts (.github/assets/chart-*.svg, light and dark) from the Pixel 8a results
// in bench/README.md. Run with `node bench/charts.mjs` after updating the numbers below.
import { writeFileSync } from 'node:fs';

const interactions = {
  title: 'Real-world interactions, Pixel 8a',
  unit: 'ms, lower is better',
  rows: [
    ['Open a 20-row screen', 37, 79],
    ['Switch language', 33, 64],
    ['Search, worst keystroke', 42, 63],
    ['Scroll, worst frame', 37, 77],
    ['Intl setup at startup', 1.4, 20],
  ],
};

const speedup = {
  title: 'Times faster than FormatJS, per call, Pixel 8a',
  unit: 'log scale',
  log: true,
  rows: [
    ['PluralRules selectRange', 556],
    ['PluralRules select', 506],
    ['RelativeTimeFormat format', 456],
    ['new Intl.Locale (first)', 205],
    ['RelativeTimeFormat formatToParts', 134],
    ['Locale maximize', 46],
    ['ListFormat format', 13],
    ['ListFormat formatToParts', 2.3],
  ],
};

const themes = {
  light: { text: '#1f2328', muted: '#59636e', grid: '#d1d9e0', hermes: '#1a7f37', formatjs: '#d9480f' },
  dark: { text: '#f0f6fc', muted: '#9198a1', grid: '#3d444d', hermes: '#3fb950', formatjs: '#f0883e' },
};

const W = 760;
const LABEL = 250;
const BAR = W - LABEL - 90;
const font = 'font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif"';
const fmt = v => (v >= 100 ? Math.round(v).toLocaleString('en-US') : String(v));

function header(chart, t, legend) {
  let s = `<text x="0" y="22" font-size="17" font-weight="600" fill="${t.text}">${chart.title}</text>`;
  s += `<text x="0" y="44" font-size="13" fill="${t.muted}">${chart.unit}</text>`;
  if (legend) {
    s += `<rect x="${W - 250}" y="33" width="12" height="12" rx="2" fill="${t.hermes}"/>`;
    s += `<text x="${W - 232}" y="44" font-size="13" fill="${t.text}">hermes-intl</text>`;
    s += `<rect x="${W - 140}" y="33" width="12" height="12" rx="2" fill="${t.formatjs}"/>`;
    s += `<text x="${W - 122}" y="44" font-size="13" fill="${t.text}">FormatJS</text>`;
  }
  return s;
}

function pairs(chart, t) {
  const max = Math.max(...chart.rows.map(r => r[2]));
  let y = 64;
  let s = header(chart, t, true);
  for (const [label, a, b] of chart.rows) {
    s += `<text x="0" y="${y + 21}" font-size="14" fill="${t.text}">${label}</text>`;
    for (const [i, v, color] of [[0, a, t.hermes], [1, b, t.formatjs]]) {
      const w = Math.max(2, (v / max) * BAR);
      const by = y + i * 16;
      s += `<rect x="${LABEL}" y="${by}" width="${w}" height="13" rx="3" fill="${color}"/>`;
      s += `<text x="${LABEL + w + 6}" y="${by + 11}" font-size="12" fill="${t.muted}">${fmt(v)} ms</text>`;
    }
    y += 44;
  }
  return { s, h: y };
}

function bars(chart, t) {
  const max = Math.log10(Math.max(...chart.rows.map(r => r[1])));
  let y = 64;
  let s = header(chart, t, false);
  for (const tick of [1, 10, 100]) {
    const x = LABEL + (Math.log10(tick) / max) * BAR;
    s += `<line x1="${x}" y1="58" x2="${x}" y2="${58 + chart.rows.length * 30}" stroke="${t.grid}"/>`;
    s += `<text x="${x}" y="${74 + chart.rows.length * 30}" font-size="12" fill="${t.muted}" text-anchor="middle">${tick}×</text>`;
  }
  for (const [label, v] of chart.rows) {
    const w = Math.max(3, (Math.log10(v) / max) * BAR);
    s += `<text x="0" y="${y + 14}" font-size="14" fill="${t.text}">${label}</text>`;
    s += `<rect x="${LABEL}" y="${y + 2}" width="${w}" height="16" rx="3" fill="${t.hermes}"/>`;
    s += `<text x="${LABEL + w + 6}" y="${y + 15}" font-size="13" font-weight="600" fill="${t.text}">${fmt(v)}×</text>`;
    y += 30;
  }
  return { s, h: y + 22 };
}

for (const [name, chart, draw] of [['interactions', interactions, pairs], ['speedup', speedup, bars]]) {
  for (const [theme, t] of Object.entries(themes)) {
    const { s, h } = draw(chart, t);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" ${font}>${s}</svg>\n`;
    writeFileSync(new URL(`../.github/assets/chart-${name}-${theme}.svg`, import.meta.url), svg);
  }
}
