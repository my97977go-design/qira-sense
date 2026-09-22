import { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Square,
  Hand,
  Undo2,
  Trash2,
  Save,
  RotateCcw,
} from "lucide-react";
import { transport } from "../audio/transport.js";
import { COUNT_IN_SECONDS, detectLeadSilence } from "../audio/leadIn.js";
import {
  analyzeTaps,
  loadCalibration,
  saveCalibration,
  clearCalibration,
} from "../game/beatCalibration.js";
import beatPreview from "../data/beat-preview.json";

const RATES = [0.5, 0.75, 1];

// 教师维护 · 节拍标定：播放音乐，教师跟随听到的真实拍点打一遍拍子。
// 系统记录每次打拍时刻并分析拍速/相位，保存后第一关节拍判定以此为准。
export default function BeatCalibration({ song }) {
  const [taps, setTaps] = useState([]);
  const [rate, setRate] = useState(1);
  const [clock, setClock] = useState({ phase: "idle", time: 0, until: 0 });
  const [preview, setPreview] = useState(null);
  const [saved, setSaved] = useState(() => loadCalibration());
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let raf;
    const tick = () => {
      setClock({
        phase: transport.phase,
        time: transport.time,
        until: transport.timeUntilStart,
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      transport.stop();
      transport.setRate(1);
    };
  }, []);

  const tap = () => {
    if (transport.phase !== "playing" || transport.timeUntilStart > 0) return;
    setTaps((prev) => [...prev, Math.round(transport.time * 1000) / 1000]);
    setPreview(null);
    setNotice("");
  };
  const tapRef = useRef(tap);
  tapRef.current = tap;
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== "Space" || e.repeat) return;
      // 焦点在控件上时保留原生空格行为（如聚焦打拍按钮时由 click 触发）
      if (e.target.closest?.("button, input, textarea, select")) return;
      e.preventDefault();
      tapRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const play = async () => {
    try {
      await transport.load(song.audio);
      // 3-2-1 倒数（0 不显示），头部空白计入倒数：数到 0 音乐第一个声音出现
      const lead = detectLeadSilence(transport.buffer);
      transport.play(lead, COUNT_IN_SECONDS);
    } catch (error) {
      setNotice(error.message);
    }
  };
  const changeRate = (r) => {
    setRate(r);
    transport.setRate(r);
  };
  const analyze = () => {
    const res = analyzeTaps(taps);
    if (!res) {
      setPreview(null);
      setNotice("打拍不足或不稳定：至少 8 拍，且间隔不能忽快忽慢。");
      return;
    }
    setPreview(res);
    setNotice("");
  };
  const keep = () => {
    const res = preview || analyzeTaps(taps);
    if (!res) {
      setNotice("请先打满至少 8 拍，再点“分析并预览”。");
      return;
    }
    const rec = { ...res, savedAt: new Date().toISOString() };
    saveCalibration(rec);
    setSaved(rec);
    setNotice("已保存：第一关“听见节奏”将以此节拍为准。");
  };
  const drop = () => {
    clearCalibration();
    setSaved(null);
    setPreview(null);
    setNotice("已清除标定，恢复自动估算。");
  };

  const playing = clock.phase === "playing";
  const lastGap =
    taps.length > 1 ? (taps[taps.length - 1] - taps[taps.length - 2]) * 1000 : null;

  return (
    <div className="beatcal">
      <div className="beatcal-head">
        <h2>节拍标定 · 人工打拍</h2>
        <p>
          播放音乐，教师跟随听到的真实拍点打一遍拍子（点按钮或按空格）。
          系统记录每次打拍时刻、分析拍速与相位；保存后，第一关的节拍判定只以这一遍为准。
        </p>
      </div>

      <div className="studio-transport">
        {playing ? (
          <button className="secondary-button" onClick={() => transport.pause()}>
            <Pause size={15} /> 暂停
          </button>
        ) : clock.phase === "paused" ? (
          <button className="secondary-button" onClick={() => transport.resume()}>
            <Play size={15} /> 继续
          </button>
        ) : (
          <button className="secondary-button" onClick={play}>
            <Play size={15} /> 从头播放
          </button>
        )}
        <button className="text-button" onClick={() => transport.stop()}>
          <Square size={14} /> 停止
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
        <div className="studio-clock">
          <b>
            {clock.until > 0
              ? Math.ceil(clock.until)
              : `${Math.max(0, clock.time).toFixed(2)} s`}
          </b>
          <small>
            {clock.until > 0
              ? "倒数中 · 0 时出第一个声音"
              : playing
                ? "播放中 · 跟拍"
                : clock.phase === "paused"
                  ? "已暂停"
                  : "未开始"}
          </small>
        </div>
      </div>

      <div className="beatcal-taprow">
        <button
          className="beatcal-tap"
          disabled={!playing || clock.until > 0}
          onPointerDown={(e) => {
            if (e.button === 0) {
              e.preventDefault();
              tap();
            }
          }}
          onClick={(e) => {
            if (e.detail === 0) tap();
          }}
        >
          <Hand size={18} /> 跟拍点这里 <kbd>SPACE</kbd>
        </button>
        <div className="beatcal-count">
          <b>{taps.length}</b>
          <span>已记录拍数</span>
        </div>
        <div className="beatcal-count">
          <b>{lastGap === null ? "—" : `${Math.round(lastGap)} ms`}</b>
          <span>与上一拍间隔</span>
        </div>
        <button
          className="text-button"
          disabled={!taps.length}
          onClick={() => {
            setTaps((p) => p.slice(0, -1));
            setPreview(null);
          }}
        >
          <Undo2 size={14} /> 撤销上一拍
        </button>
        <button
          className="text-button"
          disabled={!taps.length}
          onClick={() => {
            setTaps([]);
            setPreview(null);
            setNotice("");
          }}
        >
          <RotateCcw size={14} /> 清空重打
        </button>
      </div>

      <div className="beatcal-actions">
        <button
          className="secondary-button"
          disabled={taps.length < 2}
          onClick={analyze}
        >
          分析并预览
        </button>
        <button className="primary-button" disabled={!preview} onClick={keep}>
          <Save size={15} /> 保存为正式节拍
        </button>
        {saved && (
          <button className="text-button" onClick={drop}>
            <Trash2 size={14} /> 清除标定
          </button>
        )}
      </div>
      {notice && (
        <p role="status" className="library-notice">
          {notice}
        </p>
      )}

      {preview && (
        <>
          <div className="beatcal-stats">
            <div>
              <b>{preview.bpm}</b>
              <span>拍速 BPM</span>
            </div>
            <div>
              <b>{(preview.offset * 1000).toFixed(0)} ms</b>
              <span>首拍相位偏移</span>
            </div>
            <div>
              <b>{preview.tapCount}</b>
              <span>有效拍数</span>
            </div>
            <div>
              <b>±{preview.meanDevMs} ms</b>
              <span>平均偏差</span>
            </div>
            <div>
              <b>{preview.maxDevMs} ms</b>
              <span>最大偏差</span>
            </div>
          </div>
          {preview.meanDevMs > 60 && (
            <p className="beatcal-warn">
              平均偏差偏大：建议放松手腕、跟稳音乐再打一遍，然后重新分析。
            </p>
          )}
          <p className="beatcal-seg">
            {preview.segments?.length ? (
              <>
                识别到速度变化：
                {preview.segments.map((s) => (
                  <span key={`${s.start}-${s.trend}`} className={s.trend}>
                    {s.start.toFixed(1)}s–{s.end.toFixed(1)}s{" "}
                    {s.trend === "accel" ? "渐快" : "渐慢"}（约 {s.bpm}{" "}
                    BPM）
                  </span>
                ))}
                ，保存后跟拍游戏会在这些段落提前提示观众。
              </>
            ) : (
              "未识别到明显渐快/渐慢（阈值 ±6%），将按稳定拍速处理。"
            )}
          </p>
        </>
      )}

      <div className="beatcal-saved">
        <span className="small-label">当前正式节拍</span>
        {saved ? (
          <>
            <p>
              {saved.builtin ? "内置固化节拍 · " : "人工标定 · "}
              {saved.bpm} BPM · 相位 {(saved.offset * 1000).toFixed(0)}{" "}
              ms · {saved.tapCount} 拍
              {saved.savedAt
                ? ` · 保存于 ${new Date(saved.savedAt).toLocaleString("zh-CN")}`
                : ""}
            </p>
            {saved.builtin && (
              <small>
                来自代码内置的固化备份，任何设备打开都生效；在本机重新打拍保存后，将以本机标定为准。
              </small>
            )}
            <small>自动估算参考：{beatPreview.bpm} BPM（已不再采用）</small>
            {saved.segments?.length > 0 && (
              <small>
                {` · 已记录 ${saved.segments.length} 段渐快/渐慢，跟拍游戏将提前提示`}
              </small>
            )}
          </>
        ) : (
          <>
            <p>尚未标定，游戏使用自动估算 {beatPreview.bpm} BPM（参考值）。</p>
            <small>教师打拍保存一次后，即取代自动估算。</small>
          </>
        )}
      </div>
    </div>
  );
}
