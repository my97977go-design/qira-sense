// 教师人工打拍标定：以教师真实打拍为准，替代 beat.worker 的自动估算。
// 分析思路：相邻间隔中位数定周期 → 剔除离群间隔取均值精修 → 相位圆均值定 offset
// → 逐拍对照拟合网格统计平均/最大偏差，供教师判断这一遍打拍是否可信。
import builtinCalibration from "../data/beat-builtin.json" with { type: "json" };
export const BEAT_CALIBRATION_KEY = "qira-beat-calibration-v1";

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// 渐快/渐慢检测：中国音乐的拍子常不固定（催板、撤板）。教师跟拍打点时，
// 若局部拍速持续偏高于全局中位 → 渐快（accel），持续偏低 → 渐慢（ritard）。
// 滑窗 5 拍，与全局 BPM 比 ±6% 判趋势，相邻同趋势窗口合并为段落。
export function detectTempoSegments(input, baselineBpm) {
  if (
    !Array.isArray(input) ||
    input.length < 16 ||
    !(baselineBpm > 30 && baselineBpm < 300)
  )
    return [];
  const taps = [...input].sort((a, b) => a - b);
  const diffs = [];
  for (let i = 1; i < taps.length; i++) {
    const d = taps[i] - taps[i - 1];
    const bpm = 60 / d;
    // 剔除漏拍/误触造成的极端间隔（低于 0.55× 或高于 1.8× 全局拍速）
    if (bpm >= baselineBpm * 0.55 && bpm <= baselineBpm * 1.8)
      diffs.push({ t: taps[i], bpm });
  }
  const W = 5;
  if (diffs.length < W * 2) return [];
  const segments = [];
  for (let i = 0; i + W <= diffs.length; i++) {
    const slice = diffs.slice(i, i + W);
    const mean = slice.reduce((s, d) => s + d.bpm, 0) / W;
    const ratio = mean / baselineBpm;
    const trend = ratio >= 1.06 ? "accel" : ratio <= 0.94 ? "ritard" : null;
    if (!trend) continue;
    const start = i === 0 ? taps[0] : diffs[i - 1].t;
    const end = slice[W - 1].t;
    const last = segments[segments.length - 1];
    if (last && last.trend === trend && start <= last.end + 1e-6) {
      last.end = Math.max(last.end, end);
      last.sum += mean;
      last.count += 1;
    } else segments.push({ start, end, trend, sum: mean, count: 1 });
  }
  // 至少覆盖 3 拍的连续变化才算“渐快/渐慢”，避免零星抖动误报
  return segments
    .filter((s) => s.end - s.start >= (60 / baselineBpm) * 3)
    .map((s) => ({
      start: Math.round(s.start * 1000) / 1000,
      end: Math.round(s.end * 1000) / 1000,
      trend: s.trend,
      bpm: Math.round((s.sum / s.count) * 10) / 10,
    }));
}

// taps：秒为单位的打拍时刻数组。返回 null 表示样本不足或过于混乱。
export function analyzeTaps(input) {
  const taps = [...input].sort((a, b) => a - b);
  if (taps.length < 8) return null;
  const diffs = [];
  for (let i = 1; i < taps.length; i++) diffs.push(taps[i] - taps[i - 1]);
  let period = median(diffs);
  if (!(period > 0.2 && period < 2)) return null; // 仅接受 30–300 BPM
  const kept = diffs.filter((d) => d > period * 0.75 && d < period * 1.25);
  if (kept.length < diffs.length * 0.6) return null; // 打拍过于忽快忽慢
  period = kept.reduce((s, d) => s + d, 0) / kept.length;
  const bpm = 60 / period;
  if (bpm < 30 || bpm > 300) return null;
  // 相位圆均值：把每拍映射到圆上取平均方向，得到网格 offset ∈ [0, period)
  let sx = 0,
    sy = 0;
  for (const t of taps) {
    const ph = (t / period) * Math.PI * 2;
    sx += Math.cos(ph);
    sy += Math.sin(ph);
  }
  const offset =
    ((((Math.atan2(sy, sx) / (Math.PI * 2)) * period) % period) + period) %
    period;
  let sum = 0,
    max = 0;
  for (const t of taps) {
    const dev = t - (offset + Math.round((t - offset) / period) * period);
    sum += Math.abs(dev);
    max = Math.max(max, Math.abs(dev));
  }
  return {
    schemaVersion: 1,
    method: "human-tap",
    bpm: Math.round(bpm * 10) / 10,
    offset: Math.round(offset * 10000) / 10000,
    period: Math.round(period * 10000) / 10000,
    tapCount: taps.length,
    meanDevMs: Math.round((sum / taps.length) * 1000),
    maxDevMs: Math.round(max * 1000),
    taps: taps.map((t) => Math.round(t * 1000) / 1000),
    // 记录这一遍打拍里的渐快/渐慢段落，供跟拍游戏预先提示观众
    segments: detectTempoSegments(taps, Math.round(bpm * 10) / 10),
  };
}

// 标定数据合法性：BPM 在 30–300 且相位为数字才算可用。
function isValidCal(cal) {
  return (
    !!cal &&
    typeof cal.bpm === "number" &&
    cal.bpm >= 30 &&
    cal.bpm <= 300 &&
    typeof cal.offset === "number"
  );
}

// 读取优先级：本机 localStorage（教师最新标定）→ 内置固化数据（随代码发布）。
// 内置数据带 builtin 标记，UI 可提示“来自固化备份，重新标定本机保存后优先”。
export function loadCalibration() {
  let raw = null;
  try {
    raw = localStorage.getItem(BEAT_CALIBRATION_KEY);
  } catch {
    raw = null;
  }
  if (raw) {
    try {
      const cal = JSON.parse(raw);
      if (isValidCal(cal)) return cal;
    } catch {
      /* 数据损坏时落到内置 */
    }
  }
  if (isValidCal(builtinCalibration))
    return { ...builtinCalibration, builtin: true };
  return null;
}

export function saveCalibration(cal) {
  localStorage.setItem(BEAT_CALIBRATION_KEY, JSON.stringify(cal));
}

export function clearCalibration() {
  localStorage.removeItem(BEAT_CALIBRATION_KEY);
}
