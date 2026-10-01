import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { LegendList } from '@legendapp/list/react-native';
import PerfHud from './PerfHud';
import i18n, { LANGUAGES } from './i18n';
import { makeFeed } from './data';
import { formatIntlOnly, formatItem } from './format';
import { runBench } from './bench';

const FEED = makeFeed(2000, Date.now());
const SCREEN_ROWS = 20;
const TYPED = 'clara';
const demo = global.__demo;

// Interactions are timed from the event to the last commit they caused. LegendList re-renders
// rows in later passes, so `timed` waits a few frames before reading the stamp.
let lastCommit = 0;
const useCommitStamp = () =>
  useLayoutEffect(() => {
    lastCommit = performance.now();
  });
function timed(update, report) {
  const t0 = performance.now();
  update();
  let frames = 0;
  const wait = () => (++frames < 4 ? requestAnimationFrame(wait) : report(Math.max(0, lastCommit - t0)));
  requestAnimationFrame(wait);
}

const Row = memo(function Row({ item, locale, now }) {
  useCommitStamp();
  const { title, meta } = formatItem(item, locale, now);
  return (
    <View style={styles.item}>
      <View style={[styles.avatar, { backgroundColor: demo.color }]}>
        <Text style={styles.avatarText}>{item.names[0][0]}</Text>
      </View>
      <View style={styles.itemText}>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        <Text style={styles.meta}>{meta}</Text>
      </View>
    </View>
  );
});

function Screen({ offset, locale, now, onClose }) {
  const items = FEED.slice(offset, offset + SCREEN_ROWS);
  return (
    <View style={styles.screen}>
      <Pressable onPress={onClose} style={[styles.screenHeader, { backgroundColor: demo.color }]}>
        <Text style={styles.screenTitle}>Notifications</Text>
        <Text style={styles.screenTitle}>✕</Text>
      </Pressable>
      <ScrollView>
        {items.map(item => <Row key={item.id} item={item} locale={locale} now={now} />)}
      </ScrollView>
    </View>
  );
}

function BenchResults({ rows, onClose }) {
  return (
    <View style={styles.screen}>
      <Pressable onPress={onClose} style={[styles.screenHeader, { backgroundColor: demo.color }]}>
        <Text style={styles.screenTitle}>Benchmark</Text>
        <Text style={styles.screenTitle}>✕</Text>
      </Pressable>
      <ScrollView contentContainerStyle={styles.benchList}>
        {rows ? (
          rows.map(([k, v]) => (
            <View key={k} style={styles.benchRow}>
              <Text style={styles.benchKey}>{k}</Text>
              <Text style={styles.benchValue} selectable>{v}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.benchKey}>Running…</Text>
        )}
      </ScrollView>
    </View>
  );
}

function Metric({ label, value }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function Action({ label, value, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.action, { borderColor: demo.color }]}>
      <Text style={styles.actionLabel}>{label}</Text>
      <Text style={styles.actionValue}>{value}</Text>
    </Pressable>
  );
}

const ms = v => (v == null ? '-' : v < 10 ? v.toFixed(1) + ' ms' : Math.round(v) + ' ms');
const show = v => (typeof v === 'number' ? ms(v) : v ?? 'tap');
const showScroll = v => (v && typeof v === 'object' ? `${v.fps} FPS · worst ${v.worst} ms` : v ?? 'tap');

function Demo() {
  const { width } = useWindowDimensions();
  const [locale, setLocale] = useState('en');
  const [now, setNow] = useState(Date.now());
  const [live, setLive] = useState(false);
  const [legend, setLegend] = useState(true);
  const [metrics, setMetrics] = useState({});
  const [screen, setScreen] = useState(null);
  const [query, setQuery] = useState('');
  const [benchRows, setBenchRows] = useState(undefined); // undefined: closed, null: running, rows: done
  const keys = useRef({ last: 0, worst: 0 });
  useCommitStamp();
  const list = useRef(null);
  const busy = useRef(false); // one scripted run at a time, or they skew each other

  // Startup: from the first line of the bundle to the first committed screen.
  useLayoutEffect(() => {
    setMetrics(m => ({ ...m, startup: performance.now() - global.__demoStart }));
  }, []);

  useLayoutEffect(() => {
    if (!live) return;
    const id = setInterval(
      () => timed(() => setNow(Date.now()), t => setMetrics(m => ({ ...m, refresh: t }))),
      1000,
    );
    return () => clearInterval(id);
  }, [live]);

  const switchTo = l =>
    timed(
      () => {
        i18n.changeLanguage(l);
        setLocale(l);
      },
      t => setMetrics(m => ({ ...m, switch: t })),
    );

  const openScreen = () =>
    timed(
      () => setScreen(s => ({ offset: s ? (s.offset + SCREEN_ROWS) % FEED.length : 0 })),
      t => setMetrics(m => ({ ...m, screen: t })),
    );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? FEED.filter(item => item.names.some(n => n.toLowerCase().includes(q))) : FEED;
  }, [query]);
  const type = text =>
    timed(
      () => setQuery(text),
      t => {
        keys.current = { last: t, worst: text.length <= 1 ? t : Math.max(keys.current.worst, t) };
        setMetrics(m => ({ ...m, search: keys.current }));
      },
    );
  // Scripted keystrokes, identical in both builds.
  const autoType = () => {
    if (busy.current) return;
    busy.current = true;
    type('');
    let i = 0;
    const id = setInterval(() => {
      i++;
      type(TYPED.slice(0, i));
      if (i === TYPED.length) {
        clearInterval(id);
        busy.current = false;
      }
    }, 250);
  };

  // The timeout lets "Running…" render first.
  const openBench = () => {
    setBenchRows(null);
    setTimeout(() => setBenchRows(runBench()), 50);
  };

  // The timeout lets "running…" render before the blocking work.
  const bench = (key, work) => {
    setMetrics(m => ({ ...m, [key]: 'running…' }));
    setTimeout(() => {
      const t0 = performance.now();
      work();
      const took = performance.now() - t0;
      setMetrics(m => ({ ...m, [key]: took }));
    }, 50);
  };
  const stressIntl = () =>
    bench('intl', () => {
      const t = Date.now();
      for (let i = 0; i < 10000; i++) formatIntlOnly(FEED[i % FEED.length], locale, t);
    });
  const stressFull = () =>
    bench('full', () => {
      const t = Date.now();
      for (let i = 0; i < 10000; i++) formatItem(FEED[i % FEED.length], locale, t);
    });

  const autoScroll = () => {
    if (busy.current) return;
    busy.current = true;
    list.current?.scrollToOffset({ offset: 0, animated: false });
    setMetrics(m => ({ ...m, scroll: 'running…' }));
    const start = performance.now();
    let last = start;
    let frames = 0;
    let worst = 0;
    const step = () => {
      const t = performance.now();
      frames++;
      worst = Math.max(worst, t - last);
      last = t;
      const elapsed = t - start;
      list.current?.scrollToOffset({ offset: elapsed * 15, animated: false }); // 15 px/ms ≈ 4 new rows per frame, a fast fling
      if (elapsed < 5000) requestAnimationFrame(step);
      else {
        busy.current = false;
        setMetrics(m => ({ ...m, scroll: { fps: Math.round((frames * 1000) / elapsed), worst: Math.round(worst) } }));
      }
    };
    requestAnimationFrame(step);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={demo.color} />
      <View style={[styles.header, { backgroundColor: demo.color }]}>
        <Text style={styles.impl}>{demo.impl}</Text>
        <Text style={styles.subtitle}>{demo.subtitle}</Text>
      </View>
      <PerfHud width={width - 24} />
      <View style={styles.metrics}>
        <Metric label="Intl setup" value={ms(demo.setupMs)} />
        <Metric label="startup → screen" value={ms(metrics.startup)} />
        <Metric label={`switch → ${locale}`} value={ms(metrics.switch)} />
        <Metric label="live refresh" value={live ? ms(metrics.refresh) : 'off'} />
      </View>
      <View style={styles.controls}>
        {LANGUAGES.map(l => (
          <Pressable key={l} onPress={() => switchTo(l)} style={[styles.button, l === locale && { backgroundColor: demo.color }]}>
            <Text style={[styles.buttonText, l === locale && styles.buttonTextOn]}>{l.toUpperCase()}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setLive(v => !v)} style={styles.button}>
          <Text style={styles.buttonText}>{live ? 'Live ●' : 'Live ○'}</Text>
        </Pressable>
        <Pressable onPress={() => setLegend(v => !v)} style={styles.button}>
          <Text style={styles.buttonText}>{legend ? 'Legend' : 'Flat'}</Text>
        </Pressable>
        <Pressable onPress={openBench} style={styles.button}>
          <Text style={styles.buttonText}>Bench</Text>
        </Pressable>
      </View>
      <View style={styles.actions}>
        <Action label="Intl only × 10,000" value={show(metrics.intl)} onPress={stressIntl} />
        <Action label="i18next + Intl × 10,000" value={show(metrics.full)} onPress={stressFull} />
      </View>
      <View style={styles.actions}>
        <Action label="Auto-scroll 5 s" value={showScroll(metrics.scroll)} onPress={autoScroll} />
        <Action label={`Open screen · ${SCREEN_ROWS} rows`} value={show(metrics.screen)} onPress={openScreen} />
      </View>
      <View style={[styles.search, { borderColor: demo.color }]}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={type}
          placeholder="Search a name"
          autoCorrect={false}
          autoCapitalize="none"
        />
        <Text style={styles.searchStat}>
          {i18n.t('results', { count: results.length })}
          {metrics.search ? ` · ${ms(metrics.search.last)}/key, worst ${ms(metrics.search.worst)}` : ''}
        </Text>
        <Pressable onPress={autoType} style={[styles.play, { backgroundColor: demo.color }]}>
          <Text style={styles.playText}>▶</Text>
        </Pressable>
      </View>
      <View style={styles.list}>
        {legend ? (
          <LegendList
            key="legend"
            ref={list}
            data={results}
            keyExtractor={item => item.id}
            extraData={`${locale}:${now}`}
            estimatedItemSize={66}
            recycleItems
            renderItem={({ item }) => <Row item={item} locale={locale} now={now} />}
          />
        ) : (
          <FlatList
            key="flat"
            ref={list}
            data={results}
            keyExtractor={item => item.id}
            extraData={`${locale}:${now}`}
            renderItem={({ item }) => <Row item={item} locale={locale} now={now} />}
          />
        )}
        {benchRows !== undefined && <BenchResults rows={benchRows} onClose={() => setBenchRows(undefined)} />}
        {screen && (
          <Screen offset={screen.offset} locale={locale} now={now} onClose={() => setScreen(null)} />
        )}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Demo />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  header: { paddingHorizontal: 16, paddingVertical: 10 },
  impl: { color: '#fff', fontSize: 30, fontWeight: '800' },
  subtitle: { color: '#ffffffcc', fontSize: 15 },
  metrics: { flexDirection: 'row', backgroundColor: '#111', paddingHorizontal: 8, paddingBottom: 10 },
  metric: { flex: 1, alignItems: 'center' },
  metricValue: { color: '#fff', fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  metricLabel: { color: '#aaa', fontSize: 11 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 10 },
  button: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: '#eee' },
  buttonText: { fontSize: 15, fontWeight: '600', color: '#222' },
  buttonTextOn: { color: '#fff' },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 10, marginBottom: 8 },
  action: { flex: 1, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 2 },
  actionLabel: { fontSize: 13, color: '#555' },
  actionValue: { fontSize: 20, fontWeight: '800', color: '#111', fontVariant: ['tabular-nums'] },
  search: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 10, marginBottom: 8, borderWidth: 2, borderRadius: 10, paddingLeft: 10 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 8, color: '#111' },
  searchStat: { fontSize: 12, color: '#555', marginHorizontal: 6, fontVariant: ['tabular-nums'] },
  play: { paddingHorizontal: 14, paddingVertical: 10, borderTopRightRadius: 7, borderBottomRightRadius: 7 },
  playText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  list: { flex: 1 },
  screen: { ...StyleSheet.absoluteFillObject, backgroundColor: '#fff' },
  screenHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  screenTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  benchList: { padding: 16, gap: 6 },
  benchRow: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ddd', paddingVertical: 4 },
  benchKey: { fontSize: 13, color: '#555' },
  benchValue: { fontSize: 15, color: '#111', fontVariant: ['tabular-nums'] },
  item: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ddd' },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 17 },
  itemText: { flex: 1 },
  title: { fontSize: 15, color: '#111' },
  meta: { fontSize: 13, color: '#666', marginTop: 2 },
});
