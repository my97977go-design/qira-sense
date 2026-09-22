// 倒计时与头部空白对齐：所有"开始播放"都先数 3-2-1（0 不显示），
// 并自动检测录音开头的静音段，让音乐的第一个声音正好落在隐藏的 0 上。
export const COUNT_IN_SECONDS = 3;

const cache = new WeakMap();

// 扫描 20ms 窗口的 RMS，连续两窗超过阈值（峰值的 5% 与绝对下限取大者）
// 即认为音乐开始；返回该起点之前的静音时长（秒）。
export function detectLeadSilence(buffer) {
  if (!buffer || !buffer.numberOfChannels) return 0;
  if (cache.has(buffer)) return cache.get(buffer);
  const sr = buffer.sampleRate || 44100;
  const win = Math.max(1, Math.round(sr * 0.02));
  const chans = [];
  for (let c = 0; c < buffer.numberOfChannels; c++)
    chans.push(buffer.getChannelData(c));
  const n = buffer.length || chans[0].length;
  let peak = 0;
  for (let i = 0; i < n; i += 7) {
    const v = Math.abs(chans[0][i] || 0);
    if (v > peak) peak = v;
  }
  const thr = Math.max(0.004, peak * 0.05);
  let run = 0,
    lead = 0;
  for (let start = 0; start + win <= n; start += win) {
    let sum = 0;
    for (let c = 0; c < chans.length; c++) {
      const d = chans[c];
      for (let i = start; i < start + win; i++) sum += d[i] * d[i];
    }
    if (Math.sqrt(sum / (win * chans.length)) > thr) {
      run += 1;
      if (run >= 2) {
        lead = (start - win) / sr;
        break;
      }
    } else run = 0;
  }
  const value = Math.min(Math.max(0, lead), Math.max(0, (buffer.duration || 0) - 0.5));
  cache.set(buffer, value);
  return value;
}
