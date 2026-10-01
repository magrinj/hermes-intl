// Flashlight (github.com/bamlab/flashlight) runs of the example app, 5 iterations each:
//   node flashlight.js <startup|scroll|usage> <com.intldemo|com.intldemo.formatjs>
// Tap coordinates are for a 1080x2400 screen (Pixel 8a). Summarize with flashlight-summary.js.
const { execSync } = require('child_process');
const { measurePerformance } = require('@perf-profiler/e2e');

const [scenario, bundleId] = process.argv.slice(2);
const adb = cmd => execSync(`adb shell ${cmd}`, { stdio: ['ignore', 'pipe', 'inherit'] });
const wait = ms => new Promise(r => setTimeout(r, ms));
const tap = async (x, y, ms) => {
  adb(`input tap ${x} ${y}`);
  await wait(ms);
};
const launch = async ms => {
  adb(`am start -n ${bundleId}/com.intldemo.MainActivity`);
  await wait(ms);
};

const scenarios = {
  startup: { duration: 6000, run: () => launch(6000) },
  scroll: {
    duration: 10000,
    run: async () => {
      await launch(4000);
      await tap(278, 1080, 6000); // auto-scroll
    },
  },
  usage: {
    duration: 18000,
    run: async () => {
      await launch(4000);
      await tap(802, 1080, 1500); // open screen
      await tap(1015, 1394, 800);
      for (const x of [197, 313, 427, 67]) await tap(x, 727, 1500); // FR, PL, AR, EN
      await tap(802, 1080, 1500);
      await tap(1015, 1394, 800);
      await tap(990, 1248, 2500); // typed search
    },
  },
};

const beforeTest = () => {
  adb('input keyevent 224');
  adb('wm dismiss-keyguard');
  adb(`am force-stop ${bundleId}`);
};

measurePerformance(bundleId, { ...scenarios[scenario], beforeTest }, {
  iterationCount: 5,
  resultsFileOptions: { path: `flashlight/${scenario}-${bundleId}.json`, title: `${bundleId} ${scenario}` },
}).then(({ writeResults }) => writeResults());
