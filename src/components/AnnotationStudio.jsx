import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  Pause,
  Save,
  Download,
  Undo2,
  Redo2,
  Trash2,
  Check,
  Ban,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import { transport } from "../audio/transport.js";
import { COUNT_IN_SECONDS, detectLeadSilence } from "../audio/leadIn.js";
import { validateSong, saveSong } from "../game/data.js";
import {
  FINAL_TECHNIQUES,
  TAP_TECHNIQUES,
  kindOf,
} from "../learning/learningConfig.js";
import { useKnowledge } from "../knowledge/KnowledgeContext.jsx";
import { Eyebrow, clock } from "./Elements.jsx";
import PulseLine from "./PulseLine.jsx";
import baseFeatures from "../data/features.json";

// 实时打点标注台：整曲播放（可 0.1×/0.5×/0.75× 慢速精标），
// 点技法（1—6）听到瞬间点按钮或按键打点；长按技法（7—9）按住记起点、松手记终点。
// 打点默认 human-confirmed / needs-review；逐条精修锚点后
// 「确认（毫秒级）」才成为快速听辨测试的正式答案。
const RATES = [0.1, 0.5, 0.75, 1];
const PRECISION_LABEL = {
  "human-millisecond": "毫秒级人工",
  "human-confirmed": "人工确认",
  "legacy-derived-subdivision": "旧版等分",
};
const STATUS_LABEL = {
  confirmed: "已确认",
  "needs-review": "待复核",
  rejected: "已拒绝",
};
const KIND_TECHNIQUE = {
  "up-glide": "up-glide",
  "down-glide": "down-glide",
  "pitch-oscillation": "vibrato",
};
const KIND_LABEL = {
  "up-glide": "上行滑音候选",
  "down-glide": "下行滑音候选",
  "pitch-oscillation": "音高振荡候选",
};
const round3 = (t) => Math.round(t * 1000) / 1000;
let seq = 0;
const newId = () =>
  `evt-${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.floor(
    Math.random() * 46656,
  ).toString(36)}`;

export default function AnnotationStudio({ song, onSaved }) {
  const { techFor } = useKnowledge();
  const duration = song.duration;
  const [events, setEvents] = useState(() => [...(song.events || [])]);
  const [selectedId, setSelectedId] = useState(null);
  const [frames, setFrames] = useState(baseFeatures.frames);
  const [candidates, setCandidates] = useState(null);
  const [candidateStatus, setCandidateStatus] = useState("loading");
  const [showCandidates, setShowCandidates] = useState(false);
  const [time, setTime] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRateState] = useState(1);
  const [cursor, setCursor] = useState(0);
  const [notice, setNotice] = useState("");
  const [flash, setFlash] = useState(null);
  const [drag, setDrag] = useState(null);
  const [version, setVersion] = useState(0);
  const past = useRef([]);
  const future = useRef([]);
  const timelineRef = useRef(null);
  const eventsRef = useRef(events);
  eventsRef.current = events;

  const selected = events.find((e) => e.id === selectedId) || null;
  const techColors = useMemo(
    () => Object.fromEntries(FINAL_TECHNIQUES.map((t) => [t, techFor(t).color])),
    [techFor],
  );

  // 外部 song 变化（保存校验后 / 导入）时同步工作副本。
  useEffect(() => {
    setEvents([...(song.events || [])]);
    setSelectedId(null);
    past.current = [];
    future.current = [];
  }, [song]);

  // 精细特征（约 10ms）可选；不存在时回退到随项目 20ms features。
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("annotation-features.json");
        if (!res.ok) return;
        const data = await res.json();
        if (
          alive &&
          Array.isArray(data.frames) &&
          data.sourceSha256 === song.sourceSha256
        )
          setFrames(data.frames);
      } catch {
        /* 保持 20ms 特征 */
      }
    })();
    (async () => {
      try {
        const res = await fetch("analysis-candidates.json");
        if (!res.ok) {
          if (alive) setCandidateStatus("missing");
          return;
        }
        const data = await res.json();
        if (!alive) return;
        if (!Array.isArray(data.candidates) || !data.candidates.length) {
          setCandidateStatus("missing");
          return;
        }
        setCandidates(data);
        setCandidateStatus(
          data.sourceSha256 && data.sourceSha256 !== song.sourceSha256
            ? "mismatch"
            : "ready",
        );
      } catch {
        if (alive) setCandidateStatus("missing");
      }
    })();
    return () => {
      alive = false;
    };
  }, [song.sourceSha256]);

  // 播放时钟。
  useEffect(() => {
    let raf;
    const tick = () => {
      setTime(transport.time);
      setPlaying(transport.phase === "playing");
      setCountdown(transport.timeUntilStart);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // 离开标注台：停止播放并恢复原速，避免影响其他页面。
  useEffect(
    () => () => {
      transport.stop();
      transport.setRate(1);
    },
    [],
  );

  const normalize = (ev) => {
    const e = { ...ev };
    if (Number.isFinite(e.start) && Number.isFinite(e.end)) {
      let s = Math.min(Math.max(0, e.start), duration);
      let en = Math.min(Math.max(0, e.end), duration);
      if (s > en) [s, en] = [en, s];
      e.start = round3(s);
      e.end = round3(en);
      e.anchor = round3(Math.min(Math.max(e.anchor ?? s, s), en));
    } else if (Number.isFinite(e.anchor)) {
      e.anchor = round3(Math.min(Math.max(0, e.anchor), duration));
    }
    return e;
  };

  // —— 历史栈：每次结构性修改记一步 ——
  const apply = (next) => {
    past.current.push(events);
    future.current = [];
    setEvents(next);
    setVersion((v) => v + 1);
  };
  const undo = () => {
    if (!past.current.length) return;
    future.current.push(events);
    setEvents(past.current.pop());
    setVersion((v) => v + 1);
  };
  const redo = () => {
    if (!future.current.length) return;
    past.current.push(events);
    setEvents(future.current.pop());
    setVersion((v) => v + 1);
  };

  // —— 播放控制 ——
  const togglePlay = async () => {
    try {
      if (transport.phase === "playing") {
        transport.pause();
      } else if (transport.phase === "paused") {
        await transport.resume();
      } else {
        await transport.load(song.audio);
        // 3-2-1 倒计时（0 不显示）：头部空白计入倒数，第一个声音正好落在 0
        const lead = detectLeadSilence(transport.buffer);
        const at = cursor <= lead + 0.05 ? lead : cursor;
        transport.play(at, COUNT_IN_SECONDS, duration);
      }
    } catch (e) {
      setNotice(`播放失败：${e.message || "录音加载失败"}`);
    }
  };
  const changeRate = (r) => {
    setRateState(r);
    transport.setRate(r);
  };
  // 从头播放：回到录音开头，带 3-2-1 倒数重新起奏。
  const playFromStart = async () => {
    try {
      await transport.load(song.audio);
      const lead = detectLeadSilence(transport.buffer);
      setCursor(lead);
      transport.play(lead, COUNT_IN_SECONDS, duration);
    } catch (e) {
      setNotice(`从头播放失败：${e.message || "录音加载失败"}`);
    }
  };
  const seekTo = (t) => {
    const c = round3(Math.min(duration, Math.max(0, t)));
    setCursor(c);
    transport.seek(c);
  };

  // —— 打点：播放中记录 {time, technique}，同一秒可多次 ——
  const tap = (technique) => {
    if (transport.phase !== "playing" || transport.timeUntilStart > 0) return;
    const t = round3(transport.time);
    const ev = {
      id: newId(),
      annotationId: null,
      technique,
      anchor: t,
      timingPrecision: "human-confirmed",
      reviewStatus: "needs-review",
      label: "",
    };
    apply([...eventsRef.current, ev]);
    setFlash({ key: ev.id, technique, time: t });
  };

  // —— 长按录入：按住记起点，松手记终点，形成 start–end 区间事件 ——
  const pendingHold = useRef(null);
  const beginHold = (technique) => {
    if (
      transport.phase !== "playing" ||
      transport.timeUntilStart > 0 ||
      pendingHold.current
    )
      return;
    const start = round3(transport.time);
    pendingHold.current = { technique, start };
    setFlash({ key: `hold-${start}`, technique, time: start, holding: true });
  };
  const endHold = () => {
    const p = pendingHold.current;
    if (!p) return;
    pendingHold.current = null;
    const start = p.start,
      end = Math.max(start + 0.1, round3(transport.time));
    const ev = {
      id: newId(),
      annotationId: null,
      technique: p.technique,
      anchor: start,
      start,
      end,
      timingPrecision: "human-confirmed",
      reviewStatus: "needs-review",
      label: "",
    };
    apply([...eventsRef.current, ev]);
    setFlash({ key: ev.id, technique: p.technique, time: start, span: end - start });
  };

  // —— 键盘：1—9 打点/长按，空格播放/暂停，Ctrl+Z/Y 撤销 ——
  useEffect(() => {
    const codes = [
      "Digit1",
      "Digit2",
      "Digit3",
      "Digit4",
      "Digit5",
      "Digit6",
      "Digit7",
      "Digit8",
      "Digit9",
    ];
    const indexOf = (code) => {
      let i = codes.indexOf(code);
      if (i < 0) i = codes.indexOf(code.replace("Digit", "Numpad"));
      return i;
    };
    const key = (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.ctrlKey || e.altKey || e.metaKey) {
        if (e.code === "KeyZ") {
          e.preventDefault();
          e.shiftKey ? redo() : undo();
        } else if (e.code === "KeyY") {
          e.preventDefault();
          redo();
        }
        return;
      }
      const i = indexOf(e.code);
      if (i >= 0 && FINAL_TECHNIQUES[i]) {
        e.preventDefault();
        if (kindOf(FINAL_TECHNIQUES[i]) === "hold") {
          if (!e.repeat) beginHold(FINAL_TECHNIQUES[i]);
        } else if (!e.repeat) tap(FINAL_TECHNIQUES[i]);
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) togglePlay();
      }
    };
    const keyUp = (e) => {
      const i = indexOf(e.code);
      if (i >= 0 && FINAL_TECHNIQUES[i] && kindOf(FINAL_TECHNIQUES[i]) === "hold")
        endHold();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", keyUp);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", keyUp);
    };
  });

  const updateSelected = (patch) => {
    if (!selected) return;
    apply(
      events.map((e) =>
        e.id === selected.id ? normalize({ ...e, ...patch }) : e,
      ),
    );
  };
  const nudge = (ms) => {
    if (!selected) return;
    updateSelected({ anchor: selected.anchor + ms / 1000 });
  };
  const confirmSelected = () =>
    updateSelected({
      timingPrecision: "human-millisecond",
      reviewStatus: "confirmed",
    });

  // —— 时间轴拖拽（锚点 / 起止）——
  const timeAt = (clientX) => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect || !rect.width) return 0;
    return round3(
      Math.min(duration, Math.max(0, ((clientX - rect.left) / rect.width) * duration)),
    );
  };
  const beginDrag = (field) => (e) => {
    e.stopPropagation();
    e.preventDefault();
    past.current.push(events);
    future.current = [];
    setDrag(field);
  };
  useEffect(() => {
    if (!drag || !selectedId) return;
    const move = (e) => {
      const t = timeAt(e.clientX);
      setEvents((prev) =>
        prev.map((ev) =>
          ev.id === selectedId ? normalize({ ...ev, [drag]: t }) : ev,
        ),
      );
    };
    const up = () => {
      setDrag(null);
      setVersion((v) => v + 1);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag, selectedId, duration]);

  // —— 试听 ——
  const audition = (anchor, span = 0.6) => {
    transport.play(
      Math.max(0, anchor - span),
      0,
      Math.min(duration, anchor + span),
    );
  };

  // —— 机器候选（仅参考）——
  const adoptCandidate = (c) => {
    const ev = normalize({
      id: newId(),
      annotationId: null,
      technique: KIND_TECHNIQUE[c.kind] || "up-glide",
      start: Number(c.start),
      end: Number(c.end),
      anchor: (Number(c.start) + Number(c.end)) / 2,
      timingPrecision: "human-confirmed",
      reviewStatus: "needs-review",
      label: `机器候选 ${c.kind} · score ${Number(c.score || 0).toFixed(2)}`,
    });
    apply([...events, ev]);
    setSelectedId(ev.id);
    setNotice(
      "已采纳为事件。请精修锚点并「确认（毫秒级）」后才能作为正式测验答案。",
    );
  };

  // —— 保存 / 导出 ——
  const buildSong = () => ({ ...song, schemaVersion: 3, events });
  const save = () => {
    try {
      const next = validateSong(buildSong());
      const ok = saveSong(next);
      onSaved?.(next);
      setNotice(
        ok
          ? "已保存 v3 标注到本浏览器。快速听辨测试与声音地图立即使用新数据。"
          : "本会话已更新；浏览器存储失败，请导出 JSON 备份。",
      );
    } catch (e) {
      setNotice(`保存失败：${e.message}`);
    }
  };
  const exportJson = () => {
    let payload;
    let note = "";
    try {
      payload = validateSong(buildSong());
    } catch (e) {
      payload = buildSong();
      note = `（注意：未通过校验 — ${e.message}）`;
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "qira-human-annotations-v3.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(`已导出 v3 JSON${note}。`);
  };

  // —— 派生显示 ——
  const officialEvents = events.filter(
    (e) =>
      e.reviewStatus === "confirmed" &&
      e.timingPrecision === "human-millisecond",
  );
  const covered = new Set(officialEvents.map((e) => e.technique));
  const sortedEvents = [...events].sort((a, b) => a.anchor - b.anchor);
  const bars = useMemo(
    () =>
      Array.from({ length: 170 }, (_, i) => {
        const f = frames[Math.floor((i / 170) * frames.length)];
        return Math.max(4, Math.min(100, (f?.rms || 0) * 650));
      }),
    [frames],
  );

  const commitNumber = (field) => (e) => {
    const v = e.target.value;
    const num = v === "" ? undefined : Number(v);
    if (num !== undefined && !Number.isFinite(num)) {
      setNotice("请输入有效的时间（秒）。");
      return;
    }
    if ((selected?.[field] ?? undefined) === num) return;
    updateSelected({ [field]: num });
  };

  return (
    <section className="studio-page">
      <div className="studio-head">
        <div>
          <Eyebrow>Teacher Maintenance · 实时打点标注</Eyebrow>
          <h2>边听边打点，生成毫秒级事件库</h2>
          <p>
            播放中点击技法按钮（或按 1—9 键）即刻记录时间点，同一秒可连续多次；
            0.1× 慢速便于毫秒级精标。打点需逐条精修并「确认（毫秒级）」后才成为
            快速听辨测试正式答案。
          </p>
        </div>
        <div className="studio-toolbar">
          <button
            className="icon-button"
            aria-label="撤销"
            title="撤销 (Ctrl+Z)"
            disabled={!past.current.length}
            onClick={undo}
          >
            <Undo2 size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="重做"
            title="重做 (Ctrl+Shift+Z)"
            disabled={!future.current.length}
            onClick={redo}
          >
            <Redo2 size={17} />
          </button>
          <button className="primary-button" onClick={save}>
            <Save size={15} />
            保存 v3
          </button>
          <button className="secondary-button" onClick={exportJson}>
            <Download size={15} />
            导出 JSON
          </button>
        </div>
      </div>

      {candidateStatus === "mismatch" && (
        <div className="studio-warning" role="status">
          <AlertTriangle size={16} />
          机器候选来自不同录音哈希，与当前《大起板》不一致，仅供参考。
        </div>
      )}
      {notice && (
        <p className="studio-notice" role="status">
          {notice}
        </p>
      )}

      {/* —— 走带：播放 / 倍速 / 打点按钮 —— */}
      <div className="studio-transport">
        <button
          className="primary-button studio-play"
          onClick={togglePlay}
          aria-label={playing ? "暂停" : "播放"}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
          {playing ? "暂停" : transport.phase === "paused" ? "继续" : "播放"}
          <kbd>空格</kbd>
        </button>
        <button
          className="secondary-button studio-restart"
          onClick={playFromStart}
          aria-label="从头播放"
          title="回到开头，带 3-2-1 倒数重新起奏"
        >
          <RotateCcw size={15} />
          从头播放
        </button>
        <div className="studio-rates" role="group" aria-label="播放倍速">
          {RATES.map((r) => (
            <button
              key={r}
              className={rate === r ? "active" : ""}
              onClick={() => changeRate(r)}
            >
              {r}×
            </button>
          ))}
        </div>
        <span className="studio-clock" role="timer">
          {countdown > 0 ? Math.ceil(countdown) : clock(time)}
          <small>
            {countdown > 0
              ? "倒数中 · 第一个声音落在 0"
              : `${Math.max(0, time).toFixed(3)}s / ${clock(duration)}`}
          </small>
        </span>
        <div className="studio-tapbar">
          {FINAL_TECHNIQUES.map((t, i) => {
            const tech = techFor(t);
            const hold = kindOf(t) === "hold";
            return (
              <Fragment key={t}>
                {i === 0 && <span className="tapbar-sep">点技法</span>}
                {i === TAP_TECHNIQUES.length && (
                  <span className="tapbar-sep">长按技法</span>
                )}
                <button
                  className={`studio-tap ${hold ? "hold" : ""}`}
                  style={{ "--tech": tech.color }}
                  disabled={!playing}
                  onClick={() => !hold && tap(t)}
                  onPointerDown={(e) => {
                    if (hold && e.button === 0) {
                      e.preventDefault();
                      beginHold(t);
                    }
                  }}
                  onPointerUp={() => hold && endHold()}
                  onPointerLeave={() => hold && endHold()}
                  title={
                    hold
                      ? `播放中按住记录起止（键 ${i + 1}）`
                      : `播放中点击打点（键 ${i + 1}）`
                  }
                >
                  <kbd>{i + 1}</kbd>
                  <b>{tech.name}</b>
                  {hold && <i>长按</i>}
                </button>
              </Fragment>
            );
          })}
          {flash && (
            <span key={flash.key} className="studio-flash" role="status">
              {flash.holding ? "按住中…" : "+"}
              {techFor(flash.technique).name}
              {kindOf(flash.technique) === "hold" && !flash.holding ? "·长按" : ""}{" "}
              @ {flash.time.toFixed(3)}s
              {flash.span ? `（${flash.span.toFixed(2)}s）` : ""}
            </span>
          )}
        </div>
      </div>

      {/* —— 心电图（音高轮廓，帮助核对滑音走向）—— */}
      <PulseLine
        frames={frames}
        time={time}
        duration={duration}
        events={events.filter((e) => e.reviewStatus !== "rejected")}
        colors={techColors}
        windowSec={8}
        height={96}
        className="studio-pulse"
      />

      {/* —— 时间轴 —— */}
      {/* 时间轴：按住即可来回拖动定位（pointer capture 让手指滑出也能跟随） */}
      <div
        className="studio-timeline"
        ref={timelineRef}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          seekTo(timeAt(e.clientX));
        }}
        onPointerMove={(e) => {
          if (!e.buttons) return;
          seekTo(timeAt(e.clientX));
        }}
      >
        <div className="waveform" aria-hidden="true">
          {bars.map((h, i) => (
            <i key={i} style={{ height: `${h}%` }} />
          ))}
        </div>
        {events.map((ev) => {
          const tech = techFor(ev.technique);
          const s = ev.start ?? ev.anchor;
          const en = ev.end ?? ev.anchor;
          return (
            <span
              key={ev.id}
              className={`studio-event-band ${ev.reviewStatus} ${
                ev.id === selectedId ? "active" : ""
              }`}
              style={{
                left: `${(s / duration) * 100}%`,
                width: `${Math.max(0.18, ((en - s) / duration) * 100)}%`,
                "--tech": tech.color,
              }}
              title={`${tech.name} @ ${ev.anchor.toFixed(3)}s · ${STATUS_LABEL[ev.reviewStatus]}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId(ev.id);
                seekTo(ev.anchor);
              }}
            />
          );
        })}
        {selected && Number.isFinite(selected.start) && (
          <i
            className="studio-handle start"
            style={{ left: `${(selected.start / duration) * 100}%` }}
            onPointerDown={beginDrag("start")}
          />
        )}
        {selected && Number.isFinite(selected.end) && (
          <i
            className="studio-handle end"
            style={{ left: `${(selected.end / duration) * 100}%` }}
            onPointerDown={beginDrag("end")}
          />
        )}
        {selected && Number.isFinite(selected.anchor) && (
          <i
            className="studio-handle anchor"
            style={{ left: `${(selected.anchor / duration) * 100}%` }}
            title="锚点：技法真正发生的瞬间"
            onPointerDown={beginDrag("anchor")}
          />
        )}
        <div
          className="studio-playhead"
          style={{ left: `${(Math.max(0, time) / duration) * 100}%` }}
        />
        <div
          className="studio-cursor"
          style={{ left: `${(cursor / duration) * 100}%` }}
        />
      </div>
      <div className="timeline-ticks">
        {[0, 5, 10, 15, 20, 25, 30, 35, duration].map((t, i) => (
          <span key={i}>{clock(t)}</span>
        ))}
      </div>

      <div className="studio-layout">
        <div className="studio-main">
          {selected ? (
            <div className="studio-editor" key={`${selected.id}-${version}`}>
              <div className="editor-heading">
                <h3>
                  精修事件 <small>{selected.id}</small>
                </h3>
                <span className={`badge ${selected.reviewStatus}`}>
                  {STATUS_LABEL[selected.reviewStatus]}
                </span>
                <span className="badge">
                  {PRECISION_LABEL[selected.timingPrecision] ||
                    selected.timingPrecision}
                </span>
              </div>
              <div className="studio-tech-picker">
                {FINAL_TECHNIQUES.map((t) => {
                  const tech = techFor(t);
                  return (
                    <button
                      key={t}
                      className={selected.technique === t ? "active" : ""}
                      style={{ "--tech": tech.color }}
                      onClick={() => updateSelected({ technique: t })}
                    >
                      <span
                        className="choice-dot"
                        style={{ background: tech.color }}
                      />
                      {tech.name}
                    </button>
                  );
                })}
              </div>
              <div className="studio-nudge" role="group" aria-label="锚点微调">
                <span>锚点 {selected.anchor.toFixed(3)}s</span>
                {[-50, -10, -1, 1, 10, 50].map((ms) => (
                  <button key={ms} onClick={() => nudge(ms)}>
                    {ms > 0 ? `+${ms}` : ms}ms
                  </button>
                ))}
                <button className="nudge-play" onClick={() => audition(selected.anchor)}>
                  <Play size={12} />
                  试听 ±0.6s
                </button>
              </div>
              <div className="studio-fields">
                <label>
                  锚点 anchor（秒 · 判定依据）
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    max={duration}
                    defaultValue={selected.anchor ?? ""}
                    onBlur={commitNumber("anchor")}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  />
                </label>
                <label>
                  起点 start（秒，可空）
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    max={duration}
                    defaultValue={selected.start ?? ""}
                    onBlur={commitNumber("start")}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  />
                </label>
                <label>
                  终点 end（秒，可空）
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    max={duration}
                    defaultValue={selected.end ?? ""}
                    onBlur={commitNumber("end")}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  />
                </label>
                <label>
                  关联区间标注
                  <select
                    value={selected.annotationId || ""}
                    onChange={(e) =>
                      updateSelected({ annotationId: e.target.value || null })
                    }
                  >
                    <option value="">（不关联）</option>
                    {song.annotations.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.start}—{a.end}s · {a.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  备注
                  <input
                    type="text"
                    maxLength={200}
                    defaultValue={selected.label || ""}
                    onBlur={(e) => updateSelected({ label: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  />
                </label>
              </div>
              <div className="studio-editor-actions">
                <button className="primary-button" onClick={confirmSelected}>
                  <Check size={15} />
                  确认（毫秒级人工）
                </button>
                <button
                  className="secondary-button"
                  onClick={() => updateSelected({ reviewStatus: "rejected" })}
                >
                  <Ban size={14} />
                  Reject
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    apply(events.filter((e) => e.id !== selected.id));
                    setSelectedId(null);
                  }}
                >
                  <Trash2 size={14} />
                  删除
                </button>
              </div>
            </div>
          ) : (
            <div className="studio-hint">
              <p>
                流程：播放（可 0.1×）→ 听到技法瞬间点按钮 / 按 1—6 键打点 →
                暂停 → 在下方列表逐条选中，用 ±1ms 微调锚点并「确认（毫秒级）」。
                时间轴可点击，也可按住来回拖动定位。
              </p>
              <p className="studio-coverage">
                正式测验可用事件：{officialEvents.length} 个 · 覆盖技法{" "}
                {covered.size}/{FINAL_TECHNIQUES.length}
                {covered.size > 0 &&
                  `（${FINAL_TECHNIQUES.filter((t) => covered.has(t))
                    .map((t) => techFor(t).name)
                    .join("、")}）`}
              </p>
            </div>
          )}
        </div>

        <aside className="studio-side">
          <div className="studio-panel">
            <div className="panel-head">
              <span>事件列表</span>
              <small>
                {events.length} 个 · 正式可用 {officialEvents.length}
              </small>
            </div>
            {sortedEvents.length === 0 && (
              <p>尚无事件。播放中点击技法按钮打点。</p>
            )}
            <div className="studio-event-list">
              {sortedEvents.map((ev) => {
                const tech = techFor(ev.technique);
                return (
                  <button
                    key={ev.id}
                    className={`studio-event-row ${
                      ev.id === selectedId ? "active" : ""
                    } ${ev.reviewStatus}`}
                    onClick={() => {
                      setSelectedId(ev.id);
                      seekTo(ev.anchor);
                    }}
                  >
                    <span
                      className="choice-dot"
                      style={{ background: tech.color }}
                    />
                    <b>{tech.name}</b>
                    <small>@{ev.anchor.toFixed(3)}s</small>
                    <span className={`badge ${ev.reviewStatus}`}>
                      {STATUS_LABEL[ev.reviewStatus]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="studio-panel">
            <div className="panel-head">
              <span>机器候选（仅参考）</span>
              <small>
                {candidateStatus === "loading"
                  ? "读取中…"
                  : candidateStatus === "missing"
                    ? "未生成"
                    : `${candidates?.candidates?.length || 0} 个`}
              </small>
            </div>
            {candidateStatus === "loading" && <p>正在读取候选数据…</p>}
            {candidateStatus === "missing" && (
              <p>
                机器识别不准时请以人工打点为准。候选数据可选：运行{" "}
                <code>scripts/analyze_audio.py</code> 生成。
              </p>
            )}
            {(candidateStatus === "ready" || candidateStatus === "mismatch") && (
              <>
                <button
                  className="secondary-button"
                  onClick={() => setShowCandidates((v) => !v)}
                >
                  {showCandidates ? "收起候选" : "展开候选"}
                </button>
                {showCandidates &&
                  (candidates?.candidates || []).map((c, i) => (
                    <div key={i} className="studio-candidate">
                      <button
                        className="candidate-main"
                        onClick={() =>
                          audition((Number(c.start) + Number(c.end)) / 2, 1)
                        }
                      >
                        <b>{KIND_LABEL[c.kind] || c.kind}</b>
                        <small>
                          {Number(c.start).toFixed(2)}—{Number(c.end).toFixed(2)}s
                        </small>
                      </button>
                      <div className="candidate-actions">
                        <button onClick={() => adoptCandidate(c)}>采纳</button>
                      </div>
                    </div>
                  ))}
              </>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
