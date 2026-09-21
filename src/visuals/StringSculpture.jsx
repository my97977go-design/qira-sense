import { useEffect, useRef, useState } from "react";
import { MoveUpRight, Hand } from "lucide-react";

export default function StringSculpture({ muted }) {
  const canvas = useRef(null),
    pointer = useRef({ x: 0, y: 0, down: false, impulse: 0 }),
    mute = useRef(muted),
    [touched, setTouched] = useState(false);
  mute.current = muted;
  const synth = useRef(null);
  const pluck = () => {
    pointer.current.impulse = 1;
    setTouched(true);
    if (mute.current) return;
    try {
      synth.current ||= new (
        window.AudioContext || window.webkitAudioContext
      )();
      const ctx = synth.current;
      ctx.resume().catch(() => {});
      const oscillator = ctx.createOscillator(),
        gain = ctx.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = [220, 261.63, 329.63, 392, 440][
        Math.min(4, Math.floor((pointer.current.x + 1) * 2.5))
      ];
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.09, ctx.currentTime + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 1.3);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    } catch {}
  };
  useEffect(() => {
    const el = canvas.current,
      ctx = el.getContext("2d");
    if (!ctx) return;
    let width = 1,
      height = 1,
      raf,
      rotation = 0,
      last = 0;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const resize = () => {
      const r = el.getBoundingClientRect();
      width = r.width;
      height = r.height;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      el.width = width * dpr;
      el.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    const draw = (now) => {
      const dt = Math.min(0.04, (now - last) / 1000 || 0.016);
      last = now;
      const p = pointer.current;
      p.impulse = Math.max(0, p.impulse - dt * 0.8);
      rotation += (p.x * 0.4 - rotation) * 0.045;
      const time = reduce ? 0 : now / 1000;
      ctx.clearRect(0, 0, width, height);
      const scale = Math.min(width / 680, height / 570),
        cx = width * 0.51,
        cy = height * 0.49;
      const backdrop = ctx.createRadialGradient(
        cx,
        cy,
        10,
        cx,
        cy,
        290 * scale,
      );
      backdrop.addColorStop(0, "#b89d7112");
      backdrop.addColorStop(0.7, "#ab815908");
      backdrop.addColorStop(1, "transparent");
      ctx.fillStyle = backdrop;
      ctx.fillRect(0, 0, width, height);
      const project = (x, y, z) => {
        const ry = 0.25 + rotation,
          rx = 0.8 + p.y * 0.18;
        const ax = x * Math.cos(ry) + z * Math.sin(ry),
          az = z * Math.cos(ry) - x * Math.sin(ry);
        const ay = y * Math.cos(rx) - az * Math.sin(rx),
          zz = y * Math.sin(rx) + az * Math.cos(rx);
        const tilt = -0.47;
        const xx = ax * Math.cos(tilt) - ay * Math.sin(tilt),
          yy = ax * Math.sin(tilt) + ay * Math.cos(tilt);
        const perspective = 900 / (900 - zz);
        return [
          cx + xx * scale * perspective,
          cy + yy * scale * perspective,
          zz,
        ];
      };
      const strands = [];
      for (let j = 0; j < 78; j++) {
        const v = (j / 78) * Math.PI * 2,
          points = [];
        let depth = 0;
        for (let i = 0; i <= 180; i++) {
          const u = (i / 180) * Math.PI * 2;
          const twist = v + u * 1.5 + Math.sin(time * 0.25) * 0.1;
          const pulse =
            p.impulse *
            Math.sin(u * 9 - time * 18) *
            Math.pow(Math.sin(u / 2), 2) *
            14;
          const r = 187 + 67 * Math.cos(twist) + pulse;
          const x = r * Math.cos(u),
            y = r * Math.sin(u) * 1.05,
            z = 81 * Math.sin(twist) + 19 * Math.sin(u * 2 + time * 0.25);
          const point = project(x, y, z);
          points.push(point);
          depth += point[2];
        }
        strands.push({ points, depth: depth / points.length, j });
      }
      strands.sort((a, b) => a.depth - b.depth);
      for (const { points, depth, j } of strands) {
        const light = Math.max(0.18, Math.min(1, (depth + 180) / 300));
        const gradient = ctx.createLinearGradient(
          cx - 240 * scale,
          cy - 200 * scale,
          cx + 190 * scale,
          cy + 220 * scale,
        );
        gradient.addColorStop(0, `rgba(142,181,184,${light * 0.8})`);
        gradient.addColorStop(0.36, `rgba(245,232,197,${light})`);
        gradient.addColorStop(0.68, `rgba(212,166,111,${light * 0.85})`);
        gradient.addColorStop(1, `rgba(128,90,66,${light * 0.55})`);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = (j % 6 === 0 ? 1.6 : 1.05) * scale;
        ctx.beginPath();
        points.forEach(([x, y], i) =>
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y),
        );
        ctx.stroke();
      }
      // A field of orbiting motes reacts to the same pluck as the string surface.
      for (let i = 0; i < 75; i++) {
        const u = i * 2.399963 + time * 0.025,
          r = 245 + (i % 8) * 9 + p.impulse * 22;
        const [x, y, z] = project(
          Math.cos(u) * r,
          Math.sin(u) * r,
          Math.sin(i * 7.2 + time * 0.4) * 100,
        );
        ctx.fillStyle = `rgba(221,203,164,${0.12 + (z + 120) / 1000})`;
        ctx.beginPath();
        ctx.arc(x, y, (i % 5 === 0 ? 1.6 : 0.7) * scale, 0, Math.PI * 2);
        ctx.fill();
      }
      if (p.impulse > 0) {
        ctx.strokeStyle = `rgba(225,205,164,${p.impulse * 0.18})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(
          cx,
          cy,
          (280 + (1 - p.impulse) * 65) * scale,
          (170 + (1 - p.impulse) * 50) * scale,
          -0.4,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      synth.current?.close().catch(() => {});
      synth.current = null;
    };
  }, []);
  return (
    <div className="sculpture-shell">
      <div className="sculpture-top">
        <span>弦的形状</span>
        <span>FORM OF RESONANCE</span>
      </div>
      <canvas
        ref={canvas}
        tabIndex={0}
        role="button"
        aria-label="互动弦雕塑，拖动旋转，点击或按空格拨弦"
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          pointer.current.x = ((e.clientX - box.left) / box.width) * 2 - 1;
          pointer.current.y = ((e.clientY - box.top) / box.height) * 2 - 1;
          if (pointer.current.down)
            pointer.current.impulse = Math.max(0.35, pointer.current.impulse);
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          pointer.current.down = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          pluck();
        }}
        onPointerUp={() => (pointer.current.down = false)}
        onPointerCancel={() => (pointer.current.down = false)}
        onPointerLeave={() => {
          if (!pointer.current.down) {
            pointer.current.x = 0;
            pointer.current.y = 0;
          }
        }}
        onKeyDown={(e) => {
          if (["Enter", " "].includes(e.key) && !e.repeat) {
            e.preventDefault();
            e.stopPropagation();
            pluck();
          }
        }}
      />
      <div className="sculpture-bottom">
        <span>
          <Hand size={14} />
          {touched ? "再拨一下，让余韵展开" : "拖动探索 · 轻触拨弦"}
        </span>
        <MoveUpRight size={18} />
      </div>
      <span className="sculpture-coordinate">01 — ∞</span>
    </div>
  );
}
