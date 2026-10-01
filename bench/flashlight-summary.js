// Prints the averages of the flashlight/*.json results written by flashlight.js.
const fs = require('fs');
const r = require('@perf-profiler/reporter');

for (const file of fs.readdirSync('flashlight').filter(f => f.endsWith('.json')).sort()) {
  const avg = r.averageTestCaseResult(JSON.parse(fs.readFileSync(`flashlight/${file}`)));
  const measures = avg.average.measures;
  const threads = r.getAverageCpuUsagePerProcess(measures);
  const thread = name => threads.find(t => t.processName === name)?.cpuUsage.toFixed(0);
  console.log(file, {
    score: r.getScore(avg),
    fps: r.getAverageFPSUsage(measures)?.toFixed(1),
    cpu: r.getAverageCpuUsage(measures).toFixed(0),
    jsThread: thread('mqt_v_js'),
    uiThread: thread('UI Thread'),
    ramMB: r.getAverageRAMUsage(measures)?.toFixed(0),
    msAbove90pctCpu: r.averageHighCpuUsage(avg.iterations),
  });
}
