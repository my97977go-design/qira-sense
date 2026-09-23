import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { original as bakedSong } from "../game/data.js";
import { useKnowledge } from "../knowledge/KnowledgeContext.jsx";
import { clock, shortTech } from "./Elements.jsx";
import baseFeatures from "../data/features.json";

// 毫秒精度时钟：00:02.396
const msClock = (t) =>
  `${clock(t)}.${String(Math.round((t % 1) * 1000)).padStart(3, "0")}`;

// 固化标注核对弹窗：只读展示随代码固化的 song.json，供教师核对“固化下来的到底是什么”。
// 有毫秒事件时以事件层为唯一主视图（声音地图 / 游戏谱面 / 快速听辨测试都由它驱动），
// 旧的秒级技法区间折叠到底部仅供参考，不再抢视觉重点、避免误以为旧数据还生效。
export default function BakedReview({ onClose }) {
  const { techFor } = useKnowledge();
  const [selectedId, setSelectedId] = useState(null);
  const duration = bakedSong.duration;
  const events = useMemo(
    () => [...(bakedSong.events || [])].sort((a, b) => a.anchor - b.anchor),
    [],
  );
  const annotations = useMemo(
    () => [...bakedSong.annotations].sort((a, b) => a.start - b.start),
    [],
  );
  const hasEvents = events.length > 0;

  // 技法构成摘要（按首次出现时间排序）：上滑音 ×22 · 打音 ×3 · …
  const techSummary = useMemo(() => {
    const counts = new Map();
    for (const ev of events) {
      if (!counts.has(ev.technique)) counts.set(ev.technique, 0);
      counts.set(ev.technique, counts.get(ev.technique) + 1);
    }
    return [...counts.keys()].map((key) => ({
      key,
      name: techFor(key).name,
      color: techFor(key).color,
      count: counts.get(key),
    }));
  }, [events, techFor]);

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
              随代码固化的 song.json。只读视图，不受本机未保存标注影响。
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
          {/* 有事件时波形上只画事件刻度；旧区间色块仅在无事件回退时显示。 */}
          {!hasEvents &&
            annotations.map((a) => {
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
          {events.map((ev, i) => {
            const t = techFor(ev.technique);
            const sustained = ev.end != null && ev.end > ev.anchor;
            return (
              <span key={ev.id}>
                {sustained && (
                  <u
                    className="baked-span"
                    style={{
                      left: `${(ev.anchor / duration) * 100}%`,
                      width: `${((ev.end - ev.anchor) / duration) * 100}%`,
                      "--tech": t.color,
                    }}
                    aria-hidden="true"
                  />
                )}
                <i
                  className={`baked-tick ${ev.id === selectedId ? "active" : ""}`}
                  style={{
                    left: `${(ev.anchor / duration) * 100}%`,
                    "--tech": t.color,
                  }}
                  title={`${t.name} @ ${ev.anchor.toFixed(3)}s`}
                />
                {/* 竖排两字短名，双行错位避让密集打点。 */}
                <b
                  className={`baked-elabel row-${i % 2} ${ev.id === selectedId ? "active" : ""}`}
                  style={{
                    left: `${(ev.anchor / duration) * 100}%`,
                    "--tech": t.color,
                  }}
                >
                  {shortTech(t.name)}
                </b>
              </span>
            );
          })}
        </div>
        <div className="timeline-ticks">
          {[0, 5, 10, 15, 20, 25, 30, 35, duration].map((t, i) => (
            <span key={i}>{clock(t)}</span>
          ))}
        </div>

        <div className="baked-legend">
          {hasEvents ? (
            <>
              <p className="baked-authoritative">
                <b>当前生效：{events.length} 个毫秒事件</b>
                （上方彩色竖线）——声音地图、游戏谱面、快速听辨测试全部由这些事件驱动。
              </p>
              <p className="baked-techs" aria-label="技法构成">
                {techSummary.map((t) => (
                  <span key={t.key}>
                    <i style={{ background: t.color }} />
                    {t.name} ×{t.count}
                  </span>
                ))}
              </p>
              <div className="baked-events">
                {events.map((ev, i) => {
                  const t = techFor(ev.technique);
                  const sustained = ev.end != null && ev.end > ev.anchor;
                  return (
                    <button
                      key={ev.id}
                      className={`baked-row baked-event ${ev.id === selectedId ? "active" : ""}`}
                      onClick={() =>
                        setSelectedId(ev.id === selectedId ? null : ev.id)
                      }
                    >
                      <span className="choice-dot" style={{ background: t.color }} />
                      <b>
                        {i + 1}. {t.name}
                      </b>
                      <small>
                        {msClock(ev.anchor)}
                        {sustained ? `–${msClock(ev.end)}` : ""}
                      </small>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="baked-authoritative">
              当前固化数据不含毫秒级事件，谱面回退到下面的秒级技法区间。
            </p>
          )}

          {hasEvents && (
            <details className="baked-legacy">
              <summary>
                旧·秒级技法区间（{annotations.length} 个）——不参与谱面生成，仅供技法资料库引用与无事件时回退
              </summary>
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
                    <em>
                      {a.dynamics === "crescendo"
                        ? "渐强"
                        : a.dynamics === "diminuendo"
                          ? "渐弱"
                          : ""}
                    </em>
                  </button>
                );
              })}
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
