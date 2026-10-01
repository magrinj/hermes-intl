// Formatting as a real app does it: cached Intl formatters per locale, i18next for strings.
import i18n from './i18n';

const cache = {};
export function formatters(locale) {
  if (!cache[locale]) {
    cache[locale] = {
      relative: new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }),
      list: new Intl.ListFormat(locale, { type: 'conjunction' }),
    };
  }
  return cache[locale];
}

const UNITS = [
  ['year', 365 * 86400],
  ['month', 30 * 86400],
  ['week', 7 * 86400],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
];

export function timeAgo(f, time, now) {
  const seconds = (now - time) / 1000;
  for (const [unit, size] of UNITS) {
    if (seconds >= size || unit === 'second') return f.relative.format(-Math.round(seconds / size), unit);
  }
}

export function formatItem(item, locale, now) {
  const f = formatters(locale);
  const who = item.others ? [...item.names, i18n.t('others', { count: item.others })] : item.names;
  return {
    title: i18n.t(item.kind, { who: f.list.format(who) }),
    meta: i18n.t('likes', { count: item.likes }) + ' · ' + timeAgo(f, item.time, now),
  };
}

// The Intl calls of one notification, without i18next: what the two builds actually differ on.
export function formatIntlOnly(item, locale, now) {
  const f = formatters(locale);
  f.plural = f.plural || new Intl.PluralRules(locale);
  return [f.list.format(item.names), f.plural.select(item.likes), f.plural.select(item.others), timeAgo(f, item.time, now)];
}
