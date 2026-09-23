import { useId } from "react";
import defaults from "../data/techniques.json";
import { useKnowledge } from "../knowledge/KnowledgeContext.jsx";
export const TECHNIQUES = defaults.entries;
export const techFor = (id) => {
  const t = TECHNIQUES.find((t) => t.id === id) || TECHNIQUES[0];
  return { ...t, description: t.shortExplanation };
};
function point(id, x, repeat, dynamics, duration = 2.6) {
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
