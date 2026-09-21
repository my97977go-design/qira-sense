import { useEffect, useRef } from "react";

// 整页背景粒子场：挂载在页面根容器，位于所有板块图层之下。
// 全部粒子为柔边外发光小光点（无硬边圆球），亮度克制、明暗呼吸；
// 漂浮时主动绕开避让区（如触碰弦模型）：靠近时被推开并进一步变淡。
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
      const n = Math.max(70, Math.min(170, Math.round((w * h) / 14000)));
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

    // 避让区（hole）：返回画布坐标系下的中心与半径。
    const hole = () => {
      const el = holeRef?.current;
      if (!el) return null;
      const c = canvas.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return {
        x: r.left + r.width / 2 - c.left,
        y: r.top + r.height / 2 - c.top,
        rad: Math.max(r.width, r.height) * 0.62,
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
        let a = 0.05 + 0.16 * breath; // 克制的存在感
        if (hp) {
          const dist = Math.hypot(p.x - hp.x, p.y - hp.y);
          const k = Math.min(
            1,
            Math.max(0, (dist - hp.rad * 0.55) / (hp.rad * 0.85)),
          );
          a *= k;
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
        // 避让：靠近模型区域时被向外推开
        if (hp) {
          const dx = p.x - hp.x,
            dy = p.y - hp.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist < hp.rad * 1.25) {
            const push = ((hp.rad * 1.25 - dist) / (hp.rad * 1.25)) * 0.5;
            p.x += (dx / dist) * push;
            p.y += (dy / dist) * push;
          }
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
