// Before/after for Intl in worklets: the same relative time, formatted on the JS thread after a
// scheduleOnRN hop, then right in the UI worklet. "Block JS" shows which one depends on JS.
import { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedReaction,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  createWorkletRuntime,
  runOnRuntimeSync,
  scheduleOnRN,
} from 'react-native-worklets';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);
// Log scale, so the text keeps changing through seconds, minutes, hours and days.
const LOG_RANGE = Math.log(3 * 24 * 3600);
const UNITS = [
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
];

// Runs on both threads: called from JS for "before", from the UI worklet for "after".
function ago(locale, seconds) {
  'worklet';
  const cache = (global.__agoFormats ??= {});
  const rtf = (cache[locale] ??= new Intl.RelativeTimeFormat(locale));
  const [unit, size] = UNITS.find(([, n]) => seconds >= n) ?? UNITS[3];
  return rtf.format(-Math.floor(seconds / size), unit);
}

// What a worklet sees without hermes-intl: a runtime it was never installed on.
let bareError;
function withoutLib(locale) {
  if (bareError === undefined) {
    const runtime = createWorkletRuntime({ name: 'without-hermes-intl' });
    bareError = runOnRuntimeSync(runtime, () => {
      'worklet';
      try {
        new Intl.RelativeTimeFormat(locale).format(-3, 'minute');
        return null;
      } catch (e) {
        return `${e.name}: ${e.message}`;
      }
    });
  }
  return bareError;
}

export default function Worklets({ locale, color, onClose }) {
  const logSeconds = useSharedValue(0);
  const [jsSeconds, setJsSeconds] = useState(0);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    logSeconds.value = withRepeat(
      withTiming(LOG_RANGE, { duration: 12000, easing: Easing.linear }),
      -1,
    );
  }, [logSeconds]);

  // Before: every frame goes back to the JS thread to be formatted and rendered.
  useAnimatedReaction(
    () => Math.floor(Math.exp(logSeconds.value)),
    s => scheduleOnRN(setJsSeconds, s),
  );
  // After: formatted where the animation runs.
  const animatedProps = useAnimatedProps(() => ({
    text: ago(locale, Math.exp(logSeconds.value)),
  }));

  const blockJs = () => {
    setBlocked(true);
    setTimeout(() => {
      const end = Date.now() + 2000;
      while (Date.now() < end);
      setBlocked(false);
    }, 50);
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView
          style={[styles.screen, { backgroundColor: color }]}
          edges={['top']}
        >
          <Pressable
            onPress={onClose}
            style={[styles.header, { backgroundColor: color }]}
          >
            <Text style={styles.title}>Intl in worklets</Text>
            <Text style={styles.title}>✕</Text>
          </Pressable>
          <View style={styles.body}>
            <Text style={styles.step}>1 · Without hermes-intl</Text>
            <View style={[styles.card, styles.error]}>
              <Text style={styles.errorText}>
                {withoutLib(locale) ?? 'no error'}
              </Text>
            </View>

            <Text style={styles.step}>
              2 · Before · scheduleOnRN, formatted on JS
            </Text>
            <View style={[styles.card, styles.before]}>
              <Text style={styles.value}>{ago(locale, jsSeconds)}</Text>
            </View>

            <Text style={styles.step}>
              3 · After · formatted in the worklet
            </Text>
            <View style={[styles.card, styles.after]}>
              <AnimatedTextInput
                editable={false}
                defaultValue={ago(locale, 0)}
                animatedProps={animatedProps}
                style={[styles.value, styles.input]}
              />
            </View>

            <Pressable
              onPress={blockJs}
              disabled={blocked}
              style={[styles.block, blocked && styles.blockOn]}
            >
              <Text style={styles.blockText}>
                {blocked ? 'JS thread blocked…' : 'Block the JS thread for 2 s'}
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  body: { flex: 1, padding: 16, backgroundColor: '#fff' },
  step: {
    fontSize: 13,
    fontWeight: '700',
    color: '#777',
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 6,
  },
  card: { borderRadius: 14, padding: 16, borderWidth: 1 },
  error: { backgroundColor: '#b3261e', borderColor: '#b3261e' },
  errorText: {
    color: '#fff',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 14,
  },
  before: { backgroundColor: '#fde8e8', borderColor: '#e5a5a5' },
  after: { backgroundColor: '#e3f4e8', borderColor: '#8fcca0' },
  value: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111',
    fontVariant: ['tabular-nums'],
  },
  input: { padding: 0, margin: 0 },
  block: {
    marginTop: 24,
    backgroundColor: '#111',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  blockOn: { backgroundColor: '#b3261e' },
  blockText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
