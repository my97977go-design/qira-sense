import { summarize } from "../game/chart.js";
export const clock = (t) =>
  `${Math.floor(Math.max(0, t) / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(Math.max(0, t) % 60)
    .toString()
    .padStart(2, "0")}`;
export const running = (s) => ["playing", "paused"].includes(s);
export const formatBpm = (b) => (Number.isInteger(b) ? b : b?.toFixed(1));
// 技法两字短名，用于时间轴上的紧凑标签：上滑音→上滑、打音→打音、揉弦→揉弦。
export const shortTech = (name) =>
  name.length > 2 && name.endsWith("音") ? name.slice(0, -1) : name;
export function Wordmark() {
  return (
    <span className="wordmark">
      <svg viewBox="0 0 36 38" fill="none" aria-hidden="true">
        <path
          d="M24 5C7 4 1 27 15 29C28 31 35 11 23 10C12 8 9 23 18 27L31 34"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path d="M28 5C18-2 2 13 6 25" stroke="currentColor" opacity=".5" />
      </svg>
      <strong>
        Qira Sense<small>中国音乐交互教学</small>
      </strong>
    </span>
  );
}
export function Feedback({ game }) {
  const f = game.feedback;
  // 展示时长与 v8.css 判定动画（0.68s）对齐
  return f && performance.now() - f.born < 680 ? (
    <div key={f.serial} className={`feedback ${f.grade}`} aria-hidden="true">
      <strong>
        {{ perfect: "精准", good: "命中", miss: "漏拍", empty: "跟上下一拍" }[
          f.grade
        ] || f.label}
      </strong>
      {Number.isFinite(f.delta) && (
        <small>
          {Math.abs(Math.round(f.delta * 1000))} ms{" "}
          {f.delta < 0 ? "偏早" : "偏晚"}
        </small>
      )}
    </div>
  ) : null;
}
export function Score({ game }) {
  const stats = summarize(game.results, game.notes.length);
  return (
    <div className="score">
      <span>得分</span>
      <strong>{stats.score.toString().padStart(6, "0")}</strong>
      <small>
        {stats.hits} / {game.notes.length} 命中
      </small>
    </div>
  );
}
export function Eyebrow({ children }) {
  return <p className="eyebrow">{children}</p>;
}
