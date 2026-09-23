import { useState, useEffect } from "react";
import {
  ArrowUpRight,
  Play,
  Pause,
  MoveUpRight,
  AudioLines,
} from "lucide-react";
import { activeLayerAt, trustedHumanEvents } from "../game/chart.js";
import { kindOf } from "../learning/learningConfig.js";
import { Eyebrow, clock, running } from "./Elements.jsx";
import TechniqueRibbon from "../visuals/TechniqueRibbon.jsx";
import PitchCurve from "./PitchCurve.jsx";
import { useKnowledge } from "../knowledge/KnowledgeContext.jsx";
import features from "../data/features.json";
export default function SoundMap({ game, song, request }) {
  const { library, techFor } = useKnowledge();
  // 打完即生效：存在被采信的人工事件时，地图由事件层驱动；否则回退旧区间层。
  const trusted = trustedHumanEvents(song);
  const items = trusted.length
    ? trusted.map((e) => ({
        id: e.id,
        technique: e.technique,
        start: Number.isFinite(e.start)
          ? e.start
          : Math.max(0, e.anchor - 0.35),
        end: Number.isFinite(e.end)
          ? e.end
          : Math.min(song.duration, e.anchor + 0.35),
        label: e.label || techFor(e.technique).name,
        dynamics:
          song.annotations.find((a) => a.id === e.annotationId)?.dynamics ||
          "steady",
        repeatCount: 1,
      }))
    : song.annotations.filter((a) => a.enabled !== false);
  const TECHNIQUES = library.entries.filter((t) =>
    items.some((a) => a.technique === t.id),
  );
  useEffect(() => {
    if (request) {
      const item = items.find((a) => a.id === request.annotationId);
      if (item) {
        setSelected(item.id);
        game.seek(item.start, item.end);
      }
    }
  }, [request]);
  const [selected, setSelected] = useState(null),
    active = activeLayerAt(song, game.time);
  const preview =
    game.status === "ready" || (game.status === "finished" && game.clipEnd)
      ? items.find((a) => a.id === selected) || items[0]
      : null;
  // 技法间空档：间隙不超过 2 秒时用上一个技法补位，避免文案与动画频繁闪跳。
  let carry = null;
  if (!active && !preview && game.time > 0) {
    let prev = null,
      next = null;
    for (const a of items) {
      if (a.end <= game.time && (!prev || a.end > prev.end)) prev = a;
      if (a.start >= game.time && (!next || a.start < next.start)) next = a;
    }
    if (prev && next && next.start - prev.end <= 2) carry = prev;
  }
  const current = preview || active || carry,
    tech = current
      ? techFor(
          request?.annotationId === current.id
            ? request.techniqueId
            : current.technique,
        )
      : null;
  const progress = current
    ? Math.min(
        1,
        Math.max(
          0,
          (game.time - current.start) / (current.end - current.start),
        ),
      )
    : 0;
  const select = (a) => {
    setSelected(a.id);
    // 点状事件窗口太短时，向两侧扩到约 2 秒，便于试听上下文。
    const pad = Math.max(0, (2 - (a.end - a.start)) / 2);
    game.seek(
      Math.max(0, a.start - pad),
      Math.min(song.duration, a.end + pad),
    );
  };
  return (
    <section className="play-page map-page">
      <div className="page-heading">
        <div>
          <Eyebrow>教学示例 · 原声、动画与曲线</Eyebrow>
          <h1>听一段，看懂一个变化</h1>
          <p>同一段声音，同时看动作示意、音高变化和技法解释。</p>
        </div>
        <button
          className="secondary-button"
          onClick={() => game.navigate("library")}
        >
          查看技法资料库 <ArrowUpRight size={17} />
        </button>
      </div>
      <div
        className="atlas-stage"
        style={{ "--tech": tech?.color || "#b9b9ab" }}
      >
        <div className="atlas-description">
          <span className="small-label">
            {tech ? "一句话理解技法" : "演奏进行中"}
          </span>
          <h2>{tech?.name || "演奏中…"}</h2>
          <p>
            {current
              ? tech.description
              : "演奏仍在继续，让原声继续流动，等待下一个技法动作出现。"}
          </p>
          <div className="technique-tags">
            {current ? (
              <>
                <span className={kindOf(current.technique) === "hold" ? "hold" : ""}>
                  {kindOf(current.technique) === "hold"
                    ? "持续 · 长按状态"
                    : "瞬时 · 点状动作"}
                </span>
                <span>
                  {current.start.toFixed(0).padStart(2, "0")}—
                  {current.end.toFixed(0).padStart(2, "0")} 秒
                </span>
                {current.repeatCount > 1 && (
                  <span>连续 {current.repeatCount} 次</span>
                )}
                {current.dynamics !== "steady" && (
                  <span>
                    {current.dynamics === "crescendo" ? "渐强 ↗" : "渐弱 ↘"}
                  </span>
                )}
              </>
            ) : (
              <span>演奏中 · 原声流动</span>
            )}
          </div>
          <button
            className={`round-play${
              game.status === "ready" || game.status === "finished"
                ? " round-play-invite"
                : ""
            }`}
            onClick={() =>
              game.status === "ready" || game.status === "finished"
                ? game.start("map")
                : game.togglePause()
            }
            aria-label={
              game.status === "playing" ? "暂停声音地图" : "播放声音地图"
            }
          >
            <i className="round-play-disc" aria-hidden="true">
              {game.status === "playing" ? (
                <Pause size={22} />
              ) : (
                <Play size={22} fill="currentColor" />
              )}
            </i>
            <span>
              {game.status === "playing" ? "正在聆听" : "聆听这段音乐"}
            </span>
          </button>
        </div>
        <div className="atlas-art">
          <div
            key={current?.id || "rest"}
            className="technique-transition"
            aria-hidden="true"
          />
          <div className="evidence-label">
            动作示意<span>用于帮助理解演奏动作</span>
          </div>
          {current ? (
            <TechniqueRibbon
              technique={tech.id}
              repeat={current.repeatCount}
              dynamics={current.dynamics}
              duration={Math.max(0.5, current.end - current.start)}
              progress={progress}
              playing={running(game.status)}
            />
          ) : (
            <div className="rest-wave">
              <AudioLines size={100} strokeWidth={0.7} />
            </div>
          )}
          <div className="ribbon-caption">
            <span>
              {current?.dynamics === "crescendo"
                ? "力度逐渐展开"
                : current?.dynamics === "diminuendo"
                  ? "力度缓缓收回"
                  : current?.repeatCount > 1
                    ? "四次动作，连续展开"
                    : "跟随原声中的动作"}
            </span>
            <span>示意动画</span>
          </div>
          <PitchCurve game={game} event={current} color={tech?.color} />
        </div>
      </div>
      <div className="map-teaching-cues">
        {tech ? (
          <>
            <div>
              <b>看哪里</b>
              <p>{tech.pitchCue}</p>
            </div>
            <div>
              <b>听什么</b>
              <p>{tech.listeningCue}</p>
            </div>
            <div>
              <b>想一想</b>
              <p>{tech.aestheticPrompt}</p>
            </div>
          </>
        ) : (
          <div className="cues-rest">
            <b>演奏中…</b>
            <p>
              演奏仍在继续。留意原声的强弱与走向，等待下一个技法动作出现。
            </p>
          </div>
        )}
      </div>
      <div className="technique-library">
        {TECHNIQUES.map((t, i) => {
          const a = items.find((a) => a.technique === t.id);
          return (
            <button
              key={t.id}
              disabled={!a}
              onClick={() => select(a)}
              className={tech?.id === t.id ? "active" : ""}
              style={{ "--tech": t.color }}
            >
              <span>0{i + 1}</span>
              <TechniqueRibbon mini technique={t.id} />
              <b>{t.name}</b>
            </button>
          );
        })}
      </div>
      <div className="timeline-heading">
        <span>
          完整声音地图{" "}
          <small>
            {trusted.length
              ? `${trusted.length} 个人工打点事件`
              : `${items.length} 个标注区间`}
          </small>
        </span>
        <button
          className="text-button"
          onClick={() => {
            setSelected(null);
            game.start("map");
          }}
        >
          <Play size={14} />
          连续聆听整段
        </button>
      </div>
      <div className="atlas-timeline">
        <div className="waveform" aria-hidden="true">
          {Array.from({ length: 170 }, (_, i) => {
            const f =
              features.frames[Math.floor((i / 170) * features.frames.length)];
            return (
              <i
                key={i}
                style={{
                  height: `${Math.max(4, Math.min(100, (f?.rms || 0) * 650))}%`,
                }}
              />
            );
          })}
        </div>
        <div className="annotation-track">
          {items.map((a) => (
              <button
                key={a.id}
                title={`${a.start}–${a.end} 秒 · ${a.label}`}
                aria-label={`${a.start} 至 ${a.end} 秒 ${a.label}`}
                className={`${active?.id === a.id ? "active" : ""} ${
                  kindOf(a.technique) === "hold" ? "hold" : ""
                }`}
                onClick={() => select(a)}
                style={{
                  left: `${(a.start / song.duration) * 100}%`,
                  width: `${((a.end - a.start) / song.duration) * 100}%`,
                  "--tech": techFor(a.technique).color,
                }}
              >
                <span>
                  {a.end - a.start >= 2 ? techFor(a.technique).name : "·"}
                </span>
              </button>
            ))}
        </div>
        <div
          className="map-playhead"
          style={{ left: `${(Math.max(0, game.time) / song.duration) * 100}%` }}
        >
          <span>{clock(game.time)}</span>
        </div>
        <input
          className="map-seeker"
          type="range"
          min="0"
          max={song.duration - 0.01}
          step=".01"
          value={Math.max(0, game.time)}
          aria-label="定位声音地图播放时间"
          onChange={(e) => game.seek(Number(e.target.value))}
        />
      </div>
      <div className="timeline-ticks">
        {[0, 5, 10, 15, 20, 25, 30, 35, 38.88].map((t) => (
          <span key={t}>{clock(t)}</span>
        ))}
      </div>
    </section>
  );
}
