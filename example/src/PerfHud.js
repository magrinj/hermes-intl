// JS-thread health: the bar is moved from JS every frame, so it freezes whenever the JS thread blocks.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function PerfHud({ width }) {
  const dot = useRef(null);
  const [stats, setStats] = useState({ fps: 0, worst: 0 });
  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let windowStart = last;
    let worst = 0;
    let worstStart = last;
    let id;
    const loop = () => {
      const t = performance.now();
      frames++;
      worst = Math.max(worst, t - last);
      last = t;
      // setNativeProps: Animated.Value.setValue every frame costs a commit and caps Android at 30 FPS.
      dot.current?.setNativeProps({ style: { transform: [{ translateX: ((t % 1500) / 1500) * (width - 24) }] } });
      if (t - windowStart >= 1000) {
        const fps = Math.round((frames * 1000) / (t - windowStart));
        setStats({ fps, worst: Math.round(worst) });
        frames = 0;
        windowStart = t;
        if (t - worstStart >= 3000) {
          worst = 0;
          worstStart = t;
        }
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [width]);

  const bad = stats.fps < 50;
  return (
    <View style={styles.hud}>
      <View style={styles.track}>
        <View ref={dot} style={styles.dot} />
      </View>
      <View style={styles.row}>
        <Text style={[styles.big, bad && styles.bad]}>{stats.fps} FPS</Text>
        <Text style={[styles.small, stats.worst > 50 && styles.bad]}>longest frame {stats.worst} ms</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hud: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#111' },
  track: { height: 12, borderRadius: 6, backgroundColor: '#333', marginBottom: 6 },
  dot: { width: 24, height: 12, borderRadius: 6, backgroundColor: '#fff' },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  big: { color: '#fff', fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'] },
  small: { color: '#ccc', fontSize: 15, fontVariant: ['tabular-nums'] },
  bad: { color: '#ff5c5c' },
});
