import { useEffect, useRef } from "react";

// 首页首屏背景粒子场：位于 hero 内容图层之下，页面下半部分不出现粒子。
// 全部粒子为柔边外发光小光点（无硬边圆球），低亮度、明暗呼吸；
// 以矩形禁区主动绕开触碰弦模型：进入禁区的粒子被推出且完全不可见。
export default function ParticleField({ holeRef }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let w = 0,
      h = 0,
      raf = 0,
      particles = [];

    const resize = () => {
      const r = canvas.parentElement.getBoundingClientRect();
      w = r.width;
      h = r.height;
      const d = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(w * d));
      canvas.height = Math.max(1, Math.round(h * d));
    };

    const COLORS = [
      [227, 195, 148], // 金
      [168, 213, 162], // 淡绿
      [214, 222, 196], // 月白
    ];
    const spawn = () => {
      const n = Math.max(40, Math.min(90, Math.round((w * h) / 16000)));
      particles = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.7 + Math.random() * 1.8,
        vx: (Math.random() - 0.5) * 0.16,
        vy: -0.03 - Math.random() * 0.12, // 轻微上浮
        c: COLORS[(Math.random() * COLORS.length) | 0],
        ph: Math.random() * Math.PI * 2,
        bw: 0.4 + Math.random() * 0.9, // 呼吸频率
      }));
    };

    // 避让禁区（hole）：模型包围盒外扩 margin，返回画布坐标系矩形。
    const hole = () => {
      const el = holeRef?.current;
      if (!el) return null;
      const c = canvas.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      const m = 26;
      return {
        x0: r.left - c.left - m,
        y0: r.top - c.top - m,
        x1: r.right - c.left + m,
        y1: r.bottom - c.top + m,
      };
    };

    // 柔边光点：外层光晕 + 内层软核，全部径向渐变，无硬边。
    const drawDot = (p, a) => {
      const [cr, cg, cb] = p.c;
      const glowR = p.r * 5;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR);
      g.addColorStop(0, `rgba(${cr},${cg},${cb},${a * 0.55})`);
      g.addColorStop(0.4, `rgba(${cr},${cg},${cb},${a * 0.22})`);
      g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2);
      ctx.fill();
      const core = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 1.6);
      core.addColorStop(0, `rgba(255,250,235,${a * 0.8})`);
      core.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 1.6, 0, Math.PI * 2);
      ctx.fill();
    };

    const draw = (t) => {
      const d = window.devicePixelRatio || 1;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const hp = hole();
      for (const p of particles) {
        const breath = 0.5 + 0.5 * Math.sin(t * 0.001 * p.bw + p.ph);
        let a = 0.06 + 0.2 * breath; // 亮度较上一版提高约一倍
        if (hp) {
          // 到禁区边界的距离：禁区内为 0（完全不可见），边界外 90px 内渐显
          const dx = Math.max(hp.x0 - p.x, 0, p.x - hp.x1);
          const dy = Math.max(hp.y0 - p.y, 0, p.y - hp.y1);
          a *= Math.min(1, Math.hypot(dx, dy) / 90);
        }
        if (a > 0.004) drawDot(p, a);
      }
    };

    const step = (t) => {
      const hp = hole();
      for (const p of particles) {
        // 漂浮：基础速度 + 横向微摆
        p.x += p.vx + Math.sin(t * 0.0004 + p.ph) * 0.08;
        p.y += p.vy;
        // 避让：进入模型禁区的粒子朝最近边界被推出
        if (hp && p.x > hp.x0 && p.x < hp.x1 && p.y > hp.y0 && p.y < hp.y1) {
          const dl = p.x - hp.x0,
            dr = hp.x1 - p.x,
            dt = p.y - hp.y0,
            db = hp.y1 - p.y;
          const min = Math.min(dl, dr, dt, db);
          const s = 1.4;
          if (min === dl) p.x -= s;
          else if (min === dr) p.x += s;
          else if (min === dt) p.y -= s;
          else p.y += s;
        }
        if (p.x < -12) p.x = w + 12;
        else if (p.x > w + 12) p.x = -12;
        if (p.y < -12) p.y = h + 12;
        else if (p.y > h + 12) p.y = -12;
      }
      draw(t);
      raf = requestAnimationFrame(step);
    };

    resize();
    spawn();
    if (reduced) draw(0);
    else raf = requestAnimationFrame(step);

    const ro = new ResizeObserver(() => {
      resize();
      spawn();
    });
    ro.observe(canvas.parentElement);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [holeRef]);

  return <canvas ref={canvasRef} className="hero-particles" aria-hidden="true" />;
}
