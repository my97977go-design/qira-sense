import { useId } from "react";
import defaults from "../data/techniques.json";
import { useKnowledge } from "../knowledge/KnowledgeContext.jsx";
export const TECHNIQUES = defaults.entries;
export const techFor = (id) => {
  const t = TECHNIQUES.find((t) => t.id === id) || TECHNIQUES[0];
  return { ...t, description: t.shortExplanation };
};
export function point(id, x, repeat, dynamics, duration = 2.6) {
  const local = repeat > 1 ? (x * repeat) % 1 : x;
  let y;
  if (id === "large-up-glide")
    y = 0.93 - 0.87 * (local * local * (3 - 2 * local));
  else if (id === "large-down-glide")
    y = 0.07 + 0.87 * (local * local * (3 - 2 * local));
  else if (id === "paogong")
    y = 0.66 - 0.36 * Math.abs(Math.sin(x * Math.PI * 4)) * (1 - 0.25 * x);
  else if (id === "dianbow")
    y = 0.6 - 0.23 * Math.abs(Math.sin(x * Math.PI * 3));
  else if (id === "up-glide")
    y = 0.78 - 0.58 * (local * local * (3 - 2 * local));
  else if (id === "down-glide")
    y = 0.22 + 0.58 * (local * local * (3 - 2 * local));
  else if (id === "vibrato") {
    const amp =
      dynamics === "crescendo"
        ? 0.04 + x * 0.3
        : dynamics === "diminuendo"
          ? 0.34 - x * 0.29
          : 0.24;
    y = 0.5 + Math.sin(x * Math.PI * 12) * amp;
  } else if (id === "slide-vibrato")
    y = 0.67 - 0.28 * x + Math.sin(x * Math.PI * 10) * (0.05 + 0.14 * x);
  else if (id === "dayin") {
    // 打音＝手指高频击弦：一串有规律的下陷波动，强拍深、弱拍浅交替；
    // 次数随事件时长增加（约 0.55s 一击），即使音高曲线没抓到每一次，动画也如实呈现。
    const cycles = Math.min(16, Math.max(3, Math.round(duration / 0.55)));
    const env =
      dynamics === "crescendo"
        ? 0.5 + 0.65 * x
        : dynamics === "diminuendo"
          ? 1.15 - 0.65 * x
          : 1;
    const u = x * cycles;
    const k = Math.round(u);
    const amp = (k % 2 === 0 ? 0.3 : 0.13) * env;
    y = 0.5 + amp * Math.exp(-(((u - k) / 0.3) ** 2) * 2);
  }
  else y = 0.6 - 0.38 * Math.sin(x * Math.PI) ** 2;
  return [24 + x * 652, 24 + y * 206];
}
export default function TechniqueRibbon({
  technique = "up-glide",
  progress = 0,
  repeat = 1,
  dynamics = "steady",
  duration = 2.6,
  mini = false,
  playing = false,
}) {
  const knowledge = useKnowledge();
  const uid = useId().replaceAll(":", ""),
    tech = knowledge?.techFor(technique) || techFor(technique),
    paths = [];
  for (let r = 0; r < repeat; r++) {
    const pts = [];
    for (let i = 0; i <= 140; i++) {
      const x = (r + (i / 140) * (repeat > 1 ? 0.97 : 1)) / repeat;
      const [px, py] = point(
        tech.animation,
        Math.min(0.999999, x),
        repeat,
        dynamics,
        duration,
      );
      pts.push(`${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`);
    }
    paths.push(pts.join(" "));
  }
  const [x, y] = point(
    tech.animation,
    Math.min(0.999999, Math.max(0, progress)),
    repeat,
    dynamics,
    duration,
  );
  return (
    <svg
      className={`technique-ribbon ${mini ? "mini" : ""}`}
      viewBox="0 0 700 270"
      role="img"
      aria-label={`${tech.name}${repeat > 1 ? `，${repeat}次` : ""}动作图`}
    >
      <defs>
        <linearGradient id={`ribbon-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6e9" />
          <stop offset=".45" stopColor={tech.color} />
          <stop offset="1" stopColor={tech.color} stopOpacity=".3" />
        </linearGradient>
        <filter id={`glow-${uid}`} x="-30%" y="-50%" width="160%" height="200%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
        <clipPath id={`clip-${uid}`}>
          <rect x="0" y="0" width={Math.max(0, progress) * 700} height="270" />
        </clipPath>
      </defs>
      {!mini &&
        [70, 135, 200].map((py) => (
          <path
            key={py}
            d={`M10 ${py}H690`}
            stroke="#ffffff08"
            strokeDasharray="2 7"
          />
        ))}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {paths.map((path, i) => (
          <g key={i}>
            <path
              d={path}
              stroke={tech.color}
              strokeWidth={mini ? 16 : 24}
              opacity=".1"
              filter={`url(#glow-${uid})`}
            />
            <path
              d={path}
              stroke={tech.color}
              strokeWidth={mini ? 11 : 17}
              opacity=".18"
              transform="translate(0 5)"
            />
            <path
              d={path}
              stroke={`url(#ribbon-${uid})`}
              strokeWidth={mini ? 9 : 12}
              opacity={playing ? 0.5 : 0.85}
            />
            <path
              d={path}
              stroke="#fff3db"
              strokeWidth="2"
              opacity=".35"
              transform="translate(0 -3)"
            />
            {playing && (
              <path
                d={path}
                stroke={tech.color}
                strokeWidth="13"
                clipPath={`url(#clip-${uid})`}
              />
            )}
          </g>
        ))}
      </g>
      {playing && (
        <g>
          <circle
            cx={x}
            cy={y}
            r="20"
            fill={tech.color}
            opacity=".28"
            filter={`url(#glow-${uid})`}
          />
          <circle cx={x} cy={y} r="8" fill="#fff9ec" />
          <circle
            cx={x}
            cy={y}
            r="13"
            fill="none"
            stroke={tech.color}
            strokeWidth="2"
          />
        </g>
      )}
    </svg>
  );
}

// 整段完整曲线：把本段全部音符按真实时间位置一次画全（如四个上滑音同屏出现），
// 空档用平缓连线补成连续轨迹；播放中由左向右点亮已走过的部分。
export function StageCurve({
  items = [],
  from = 0,
  to = 1,
  time = 0,
  techFor,
  playing = false,
}) {
  const uid = useId().replaceAll(":", "");
  const span = Math.max(0.01, to - from);
  const xOf = (t) => 26 + Math.min(1, Math.max(0, (t - from) / span)) * 648;
  const segs = [];
  let cursor = from,
    lastY = 24 + 0.6 * 206;
  for (const it of items) {
    const tech = techFor(it.technique);
    const s = Math.max(cursor, it.start),
      e = Math.min(to, it.end);
    if (e <= s) continue;
    if (s > cursor + 0.001)
      segs.push({ gap: true, d: `M${xOf(cursor).toFixed(1)},${lastY.toFixed(1)}L${xOf(s).toFixed(1)},${lastY.toFixed(1)}` });
    const n = 40,
      dur = Math.max(0.5, e - s),
      x0 = xOf(s),
      x1 = xOf(e);
    let d = "";
    for (let i = 0; i <= n; i++) {
      const u = i / n,
        y = point(tech.animation, Math.min(0.999999, u), 1, "steady", dur)[1];
      d += `${i ? "L" : "M"}${(x0 + u * (x1 - x0)).toFixed(1)},${y.toFixed(1)}`;
    }
    segs.push({ gap: false, d, color: tech.color, start: s });
    lastY = point(tech.animation, 0.999999, 1, "steady", dur)[1];
    cursor = e;
  }
  if (cursor < to - 0.001)
    segs.push({ gap: true, d: `M${xOf(cursor).toFixed(1)},${lastY.toFixed(1)}L${xOf(to).toFixed(1)},${lastY.toFixed(1)}` });
  const prog = Math.min(1, Math.max(0, (time - from) / span));
  return (
    <svg
      className="technique-ribbon stage-curve"
      viewBox="0 0 700 270"
      role="img"
      aria-label={`本段共 ${items.length} 个音符的完整动作曲线`}
    >
      <defs>
        <clipPath id={`stage-clip-${uid}`}>
          <rect x="0" y="0" width={prog * 700} height="270" />
        </clipPath>
        <filter id={`stage-glow-${uid}`} x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      {[70, 135, 200].map((py) => (
        <path key={py} d={`M10 ${py}H690`} stroke="#ffffff08" strokeDasharray="2 7" />
      ))}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {segs.map((sg, i) => (
          <path
            key={`base-${i}`}
            d={sg.d}
            stroke={sg.gap ? "#8fa07d" : sg.color}
            strokeWidth={sg.gap ? 3 : 11}
            opacity={sg.gap ? 0.18 : 0.24}
            {...(!sg.gap && { filter: `url(#stage-glow-${uid})`, opacity: 0.14, strokeWidth: 18 })}
          />
        ))}
        {segs.map((sg, i) => (
          <path
            key={`lit-${i}`}
            d={sg.d}
            stroke={sg.gap ? "#a8b795" : sg.color}
            strokeWidth={sg.gap ? 3 : 10}
            opacity={sg.gap ? 0.3 : 0.9}
            clipPath={`url(#stage-clip-${uid})`}
          />
        ))}
      </g>
      {items.map((it) => {
        const tech = techFor(it.technique);
        const passed = time >= it.start;
        return (
          <g key={it.id}>
            <circle cx={xOf(it.start)} cy={point(tech.animation, 0, 1, "steady", Math.max(0.5, it.end - it.start))[1]} r={passed ? 7 : 5} fill={passed ? "#fff9ec" : tech.color} opacity={passed ? 0.95 : 0.5} stroke={tech.color} strokeWidth="2" />
          </g>
        );
      })}
      {playing && prog > 0 && prog < 1 && (
        <path d={`M${xOf(time).toFixed(1)},18V252`} stroke="#fff3db" strokeWidth="1.5" opacity=".4" />
      )}
    </svg>
  );
}
