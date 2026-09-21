import { useEffect, useMemo, useRef } from "react";

// 滚动音乐曲线（「心电图」只是比喻）：一条持续向前走的线，
// 由音乐实时驱动——渐强上扬、渐弱下沉（平滑能量包络为主驱动），
// 上滑音顺势上扬、下滑音顺势下沉、揉音来回摆动（音高斜率叠加），
// 忠实还原音乐的强弱与技法状态。播放头固定在约 72% 处，曲线向左滚动。
// Final Test 与教师打点台共用。

// 预计算每帧的归一化走势 v∈[0,1]（0 底部 → 1 顶部）。
function buildSignal(frames) {
  const n = frames.length;
  if (!n) return [];
  const smooth = (arr, r) =>
    arr.map((_, i) => {
      let s = 0,
        c = 0;
      for (let j = Math.max(0, i - r); j <= Math.min(n - 1, i + r); j++) {
        s += arr[j];
        c++;
      }
      return s / c;
    });
  // 快平滑能量包络（±3 帧 ≈ ±60ms），对音乐变化保持敏感。
  const env = smooth(frames.map((f) => f.rms || 0), 3);
  const sorted = [...env].sort((a, b) => a - b);
  const peak = sorted[Math.floor(n * 0.95)] || 1; // 95 分位归一，弱奏也清晰可见
  // 音高斜率（log2）：上滑为正、下滑为负、揉音往复。
  const slope = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const p0 = frames[i - 1].pitch,
      p1 = frames[i + 1].pitch;
    if (p0 != null && p1 != null && p0 > 0 && p1 > 0)
      slope[i] = Math.log2(p1 / p0);
  }
  const slopeS = smooth(slope, 3);
  const MAX_SLOPE = 0.3;
  return frames.map((f, i) => {
    const energy = Math.min(1, env[i] / (peak * 1.1));
    const dir = Math.max(-1, Math.min(1, slopeS[i] / MAX_SLOPE));
    // 轻微呼吸波动：线永远活着，但音乐一来立刻被能量与技法接管。
    const ripple =
      0.012 * Math.sin(f.time * 3.1) + 0.008 * Math.sin(f.time * 7.7);
    return {
      time: f.time,
      v: Math.max(0, Math.min(1, energy * 0.72 + dir * 0.22 + 0.06 + ripple)),
      energy,
    };
  });
}

export default function PulseLine({
  frames,
  time,
  duration,
  events = [],
  colors = {},
  windowSec = 6,
  height = 130,
  className = "",
}) {
  const canvasRef = useRef(null);
  const signal = useMemo(() => buildSignal(frames), [frames]);
  const stateRef = useRef({});
  stateRef.current = { signal, time, duration, events, colors, windowSec };

  useEffect(() => {
    let raf;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { signal, time, duration, events, colors, windowSec } =
        stateRef.current;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth,
        h = canvas.clientHeight;
      if (!w || !h || !signal.length) return;
      if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
      if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const headX = w * 0.72; // 播放头（描记笔）位置
      const pxPerSec = w / windowSec;
      const pad = h * 0.1;
      const xOf = (t) => headX + (t - time) * pxPerSec;
      const yOf = (v) => pad + (1 - v) * (h - pad * 2);

      // —— 网格：每秒一条细线，随曲线一起滚动 ——
      ctx.strokeStyle = "rgba(255,255,255,0.045)";
      ctx.lineWidth = 1;
      const t0 = Math.max(0, time - headX / pxPerSec),
        t1 = Math.min(duration, time + (w - headX) / pxPerSec);
      for (let t = Math.ceil(t0); t <= t1; t++) {
        const x = xOf(t);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }

      // —— 事件标记（窗口内）——
      for (const ev of events) {
        const x = xOf(ev.anchor);
        if (x < -20 || x > w + 20) continue;
        const color = colors[ev.technique] || "#e3c394";
        const behind = time - ev.anchor; // >0 已过去
        const alpha = behind < 0 ? 0.85 : Math.max(0.12, 0.85 - behind * 0.25);
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha * 0.5;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(x, h * 0.08);
        ctx.lineTo(x, h * 0.92);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, h * 0.08, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // —— 流动曲线：二次贝塞尔平滑，越响越亮越粗 ——
      const from = time - headX / pxPerSec - 0.1;
      const to = time + 0.15;
      const pts = [];
      for (const s of signal) {
        if (s.time < from) continue;
        if (s.time > to) break;
        pts.push({ x: xOf(s.time), y: yOf(s.v), e: s.energy, t: s.time });
      }
      if (pts.length > 1) {
        // 光晕层：整条一次描出
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (pts[i].x + pts[i + 1].x) / 2,
            my = (pts[i].y + pts[i + 1].y) / 2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
        }
        ctx.strokeStyle = "rgba(227,195,148,0.14)";
        ctx.lineWidth = 7;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
        // 主线层：逐段按年代淡出、按能量加粗
        let prevMid = pts[0];
        for (let i = 1; i < pts.length; i++) {
          const mid =
            i < pts.length - 1
              ? {
                  x: (pts[i].x + pts[i + 1].x) / 2,
                  y: (pts[i].y + pts[i + 1].y) / 2,
                }
              : pts[i];
          const age = Math.max(0, time - pts[i].t);
          const alpha = Math.max(0.06, 1 - age / windowSec);
          ctx.strokeStyle = `rgba(227,195,148,${(0.3 + 0.7 * pts[i].e) * alpha})`;
          ctx.lineWidth = 1.1 + pts[i].e * 2.4;
          ctx.beginPath();
          ctx.moveTo(prevMid.x, prevMid.y);
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, mid.x, mid.y);
          ctx.stroke();
          prevMid = mid;
        }
      }

      // —— 描记笔光点（当前时刻的线头）——
      if (time >= 0 && time <= duration) {
        const s = valueAt(signal, time);
        const y = yOf(s ? s.v : 0.06);
        const g = ctx.createRadialGradient(headX, y, 0, headX, y, 14);
        g.addColorStop(0, "rgba(255,240,200,0.9)");
        g.addColorStop(1, "rgba(255,240,200,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(headX, y, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(headX, y, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`pulseline ${className}`.trim()}
      style={{ height }}
      aria-hidden="true"
    />
  );
}

function valueAt(signal, t) {
  let best = null;
  for (const s of signal) {
    if (s.time > t + 0.05) break;
    if (!best || Math.abs(s.time - t) < Math.abs(best.time - t)) best = s;
  }
  return best;
}
