import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { original as bakedSong } from "../game/data.js";
import { useKnowledge } from "../knowledge/KnowledgeContext.jsx";
import { clock } from "./Elements.jsx";
import baseFeatures from "../data/features.json";

// 固化标注核对弹窗：只读展示随代码固化的 song.json（技法区间 + 毫秒事件），
// 配上整曲能量曲线与音频波形，供教师核对“之前固化下来的到底是什么”。
// 数据来自构建时打包的 bakedSong（original），不受本机浏览器里的标注影响。
export default function BakedReview({ onClose }) {
  const { techFor } = useKnowledge();
  const [selectedId, setSelectedId] = useState(null);
  const duration = bakedSong.duration;
  const annotations = useMemo(
    () => [...bakedSong.annotations].sort((a, b) => a.start - b.start),
    [],
  );
  const events = useMemo(
    () => [...(bakedSong.events || [])].sort((a, b) => a.anchor - b.anchor),
    [],
  );

  // Esc 关闭。
  useEffect(() => {
    const key = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  // 整曲能量曲线（viewBox 0 0 1000 100，底部闭合填成面积图）。
  const curve = useMemo(() => {
    const frames = baseFeatures.frames || [];
    if (!frames.length) return "";
    const rms = frames.map((f) => f.rms || 0);
    const sorted = [...rms].sort((a, b) => a - b);
    const peak = sorted[Math.floor(sorted.length * 0.95)] || 1;
    const pts = frames.map((f) => {
      const x = Math.min(1000, (f.time / duration) * 1000);
      const y = 100 - Math.min(1, (f.rms || 0) / peak) * 88;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M0,100 L${pts.join(" L")} L1000,100 Z`;
  }, [duration]);

  // 波形条（与标注台同款：170 根 rms 柱）。
  const bars = useMemo(
    () =>
      Array.from({ length: 170 }, (_, i) => {
        const f = (baseFeatures.frames || [])[
          Math.floor((i / 170) * (baseFeatures.frames || []).length)
        ];
        return Math.max(4, Math.min(100, (f?.rms || 0) * 650));
      }),
    [],
  );

  return (
    <div
      className="baked-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="固化标注核对"
      onClick={onClose}
    >
      <div className="baked-modal" onClick={(e) => e.stopPropagation()}>
        <div className="baked-head">
          <div>
            <h3>固化标注核对</h3>
            <small>
              随代码固化的 song.json：{annotations.length} 个技法区间 ·{" "}
              {events.length} 个毫秒事件。只读视图，不受本机未保存标注影响。
            </small>
          </div>
          <button className="icon-button" aria-label="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="baked-curve">
          <svg
            viewBox="0 0 1000 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d={curve} className="baked-curve-fill" />
          </svg>
          <div className="baked-waveform" aria-hidden="true">
            {bars.map((h, i) => (
              <i key={i} style={{ height: `${h}%` }} />
            ))}
          </div>
          {annotations.map((a) => {
            const t = techFor(a.technique);
            return (
              <span
                key={a.id}
                className={`baked-band ${a.id === selectedId ? "active" : ""}`}
                style={{
                  left: `${(a.start / duration) * 100}%`,
                  width: `${Math.max(0.6, ((a.end - a.start) / duration) * 100)}%`,
                  "--tech": t.color,
                }}
                title={`${t.name} ${a.start}–${a.end}s · ${a.label}`}
                onClick={() =>
                  setSelectedId(a.id === selectedId ? null : a.id)
                }
              >
                {t.name}
                {a.repeatCount > 1 ? `×${a.repeatCount}` : ""}
              </span>
            );
          })}
          {events.map((ev) => {
            const t = techFor(ev.technique);
            return (
              <i
                key={ev.id}
                className="baked-tick"
                style={{
                  left: `${(ev.anchor / duration) * 100}%`,
                  "--tech": t.color,
                }}
                title={`${t.name} @ ${ev.anchor.toFixed(3)}s`}
              />
            );
          })}
        </div>
        <div className="timeline-ticks">
          {[0, 5, 10, 15, 20, 25, 30, 35, duration].map((t, i) => (
            <span key={i}>{clock(t)}</span>
          ))}
        </div>

        <div className="baked-legend">
          {annotations.map((a, i) => {
            const t = techFor(a.technique);
            return (
              <button
                key={a.id}
                className={`baked-row ${a.id === selectedId ? "active" : ""}`}
                onClick={() =>
                  setSelectedId(a.id === selectedId ? null : a.id)
                }
              >
                <span className="choice-dot" style={{ background: t.color }} />
                <b>
                  {i + 1}. {t.name}
                  {a.repeatCount > 1 ? ` ×${a.repeatCount}` : ""}
                </b>
                <small>
                  {clock(a.start)}–{clock(a.end)}
                </small>
                <i>{a.label}</i>
                <em>{a.dynamics === "crescendo" ? "渐强" : a.dynamics === "diminuendo" ? "渐弱" : ""}</em>
              </button>
            );
          })}
          {events.length > 0 && (
            <p className="baked-note">
              另有 {events.length} 个毫秒级事件（上方彩色竖线）。
            </p>
          )}
          {events.length === 0 && (
            <p className="baked-note">
              当前固化数据不含毫秒级事件，只有上面的秒级技法区间。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
