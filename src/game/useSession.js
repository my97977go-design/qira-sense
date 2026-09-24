import { useEffect, useRef, useState } from "react";
import { transport } from "../audio/transport.js";
import {
  makeChart,
  closestNote,
  closestHoldNote,
  judgement,
  judgementHold,
  summarize,
  HIT_WINDOW,
  LANES,
} from "./chart.js";
import { HOLD_LEAD_WINDOW } from "./coachStages.js";
import { loadCalibration } from "./beatCalibration.js";
import { COUNT_IN_SECONDS, detectLeadSilence } from "../audio/leadIn.js";

let beatPromise;
function detectBeat(buffer) {
  if (!beatPromise)
    beatPromise = new Promise((resolve, reject) => {
      const worker = new Worker(
        new URL("../audio/beat.worker.js", import.meta.url),
        { type: "module" },
      );
      const samples = new Float32Array(buffer.length);
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const channel = buffer.getChannelData(c);
        for (let i = 0; i < samples.length; i++)
          samples[i] += channel[i] / buffer.numberOfChannels;
      }
      const timer = setTimeout(() => {
        worker.terminate();
        beatPromise = null;
        reject(new Error("节拍分析超时，请重试或手动设置 BPM。"));
      }, 15000);
      const done = () => {
        clearTimeout(timer);
        worker.terminate();
      };
      worker.onmessage = ({ data }) => {
        done();
        if (data.error) {
          beatPromise = null;
          reject(new Error(data.error));
        } else resolve(data.result);
      };
      worker.onerror = () => {
        done();
        beatPromise = null;
        reject(new Error("节拍分析未完成，请重试或手动设置 BPM。"));
      };
      worker.postMessage({ samples, sampleRate: buffer.sampleRate }, [
        samples.buffer,
      ]);
    });
  return beatPromise;
}
const initial = () => ({
  screen: "home",
  status: "ready",
  time: 0,
  countdown: 0,
  countdownTotal: 0,
  tempoMarks: [],
  lead: 0,
  notes: [],
  results: {},
  combo: 0,
  countIn: 0,
  feedback: null,
  padFlashes: LANES.map(() => 0),
  holding: null,
  holdEngaged: {},
  summary: null,
  error: "",
});
export default function useSession(song) {
  const session = useRef(initial()),
    token = useRef(0),
    [view, setView] = useState(session.current);
  const [beat, setBeat] = useState(null),
    [manualBpm, setManualBpm] = useState(null),
    [humanBeat, setHumanBeat] = useState(() => loadCalibration()),
    [calibration, setCalibration] = useState(0),
    [speed, setSpeed] = useState(1),
    [metronome, setMetronome] = useState(false);
  const options = useRef({});
  options.current = {
    song,
    beat,
    manualBpm,
    humanBeat,
    calibration,
    speed,
    metronome,
  };
  const publish = () => setView({ ...session.current });
  const resolve = (note, result, time) => {
    const s = session.current;
    if (s.results[note.id]) return;
    s.combo = result.success ? s.combo + 1 : 0;
    s.results[note.id] = {
      ...result,
      combo: s.combo,
      points:
        result.points +
        (result.success ? Math.min(500, Math.floor(s.combo / 10) * 100) : 0),
      time,
    };
    s.feedback = { ...result, born: performance.now(), serial: note.id };
  };
  const navigate = (screen) => {
    token.current++;
    transport.stop();
    session.current = { ...initial(), screen };
    publish();
  };
  const start = async (screen = session.current.screen) => {
    const request = ++token.current;
    transport.stop();
    session.current = { ...initial(), screen, status: "loading" };
    publish();
    try {
      await transport.load(song.audio);
      if (request !== token.current) return;
      // 节拍优先级：手动 BPM > 教师人工打拍标定 > beat.worker 自动估算
      const human = loadCalibration();
      setHumanBeat(human);
      options.current.humanBeat = human;
      let analysis = options.current.beat;
      if (
        screen !== "map" &&
        !analysis &&
        !options.current.manualBpm &&
        !human
      ) {
        session.current.status = "analyzing";
        publish();
        analysis = await detectBeat(transport.buffer);
        if (request !== token.current) return;
        setBeat(analysis);
        options.current.beat = analysis;
      }
      if (request !== token.current) return;
      const base = human || analysis || {};
      const effective = {
        ...base,
        bpm: options.current.manualBpm || base.bpm,
        offset: base.offset || 0,
      };
      session.current.notes =
        screen === "map" ? [] : makeChart(song, effective, screen);
      if (screen !== "map") {
        // 截掉录音头部空白：预备拍走完时，音乐第一个声音正好进场
        const lead = detectLeadSilence(transport.buffer);
        session.current.lead = lead;
        session.current.notes = session.current.notes.filter(
          (n) => n.time >= lead - 0.02,
        );
        if (!session.current.notes.length)
          throw new Error("无法生成节拍，请设置 BPM 后重试。");
      }
      // 速度记号：教师标定打拍记录的渐快/渐慢段落 + 谱面文字标注（渐快/催板等）
      const marks = [];
      for (const seg of human?.segments || [])
        if (seg?.trend && Number.isFinite(seg.start))
          marks.push({ start: seg.start, end: seg.end, trend: seg.trend });
      for (const a of song.annotations || [])
        if (a.enabled !== false) {
          const text = `${a.label || ""} ${a.description || ""}`;
          const trend = /渐快|催板|accel/i.test(text)
            ? "accel"
            : /渐慢|撤板|慢来板|ritard/i.test(text)
              ? "ritard"
              : null;
          if (trend) marks.push({ start: a.start, end: a.end, trend });
        }
      session.current.tempoMarks = marks.sort((x, y) => x.start - y.start);
      if (screen === "map") {
        session.current.status = "playing";
        session.current.time = 0;
        transport.play(0, 0);
      } else {
        // 加载完成后先进入“armed”确认态： audio 就绪但不动，
        // 用户点“准备好了”才真正起倒数，避免太突然。
        // 跟拍游戏：预备拍 = 按当前拍速走满 8 拍（8-7-…-1），与模拟点击同拍；
        // 其余游戏保留固定 3 秒倒数。
        session.current.countIn =
          screen === "rhythm"
            ? Math.min(16, Math.max(0.8, (60 / (effective.bpm || 120)) * 8))
            : COUNT_IN_SECONDS;
        session.current.status = "armed";
      }
      publish();
    } catch (error) {
      if (request === token.current) {
        session.current.status = "error";
        session.current.error = error.message;
        publish();
      }
    }
  };
  // 确认态 → 正式开场：点“准备好了”才起预备倒数、排程音频进场
  const confirmStart = () => {
    const s = session.current;
    if (s.status !== "armed" || !(s.countIn > 0)) return;
    s.status = "playing";
    s.time = s.lead - s.countIn;
    s.countdown = s.countIn;
    s.countdownTotal = s.countIn;
    transport.play(s.lead, s.countIn);
    publish();
  };
  const togglePause = async () => {
    const s = session.current;
    if (s.status === "playing") {
      transport.pause();
      s.status = "paused";
      s.time = transport.time;
      publish();
    } else if (s.status === "paused") {
      const request = token.current;
      try {
        await transport.resume();
        if (request === token.current && session.current === s) {
          s.status = "playing";
          publish();
        }
      } catch (error) {
        s.status = "error";
        s.error = error.message;
        publish();
      }
    }
  };
  const seek = async (time, end) => {
    if (session.current.screen !== "map") return;
    const request = ++token.current;
    try {
      await transport.load(song.audio);
      if (request !== token.current) return;
      transport.play(Math.max(0, Math.min(song.duration - 0.01, time)), 0, end);
      session.current.clipEnd = end;
      session.current.status = "playing";
      session.current.time = time;
      publish();
    } catch (error) {
      if (request === token.current) {
        session.current.status = "error";
        session.current.error = error.message;
        publish();
      }
    }
  };
  // 教练模式：播放阶段片段。不清累计成绩、不换屏，可顺带装载本阶段音符；
  // resetIds 用于“重练本段”时清掉本段音符的旧判定。delay 提供预备拍。
  const playClip = async ({ start, end, delay = 0, notes, resetIds }) => {
    const request = ++token.current;
    try {
      await transport.load(song.audio);
      if (request !== token.current) return;
      const s = session.current;
      if (Array.isArray(resetIds)) for (const id of resetIds) delete s.results[id];
      if (notes) s.notes = notes;
      s.holding = null;
      s.holdEngaged = {};
      s.combo = 0;
      s.feedback = null;
      s.clipEnd = end;
      s.status = "playing";
      s.time = start - delay;
      transport.play(Math.max(0, start), delay, Math.min(end, song.duration));
      publish();
    } catch (error) {
      if (request === token.current) {
        session.current.status = "error";
        session.current.error = error.message;
        publish();
      }
    }
  };
  const finishLesson = (summary) => {
    token.current++;
    transport.stop();
    session.current.status = "finished";
    session.current.summary = summary;
    publish();
  };
  const tap = (lane) => {
    const s = session.current;
    if (
      s.status !== "playing" ||
      !["rhythm", "challenge", "falling"].includes(s.screen) ||
      transport.timeUntilStart > 0 ||
      LANES[lane]?.hold
    )
      return;
    const time = transport.time - options.current.calibration / 1000;
    s.padFlashes[lane] = performance.now();
    const note = closestNote(s.notes, s.results, time, lane);
    if (note) resolve(note, judgement(time - note.time), time);
    else {
      // 教练累计跟练：命中上一阶段已结算的音符只亮板，不罚连击。
      const echoed =
        s.screen === "challenge" &&
        s.notes.some(
          (n) =>
            n.kind !== "hold" &&
            n.lane === lane &&
            s.results[n.id] &&
            Math.abs(n.time - time) <= HIT_WINDOW + 1e-8,
        );
      if (!echoed) {
        s.combo = 0;
        s.feedback = {
          grade: "empty",
          label: "跟上下一拍",
          born: performance.now(),
          serial: `empty-${performance.now()}`,
        };
      }
    }
    publish();
  };
  // 长按：教练（challenge）容错——早/晚 0.5s 内落指都算跟上开头，松手太短不判死，
  // 按住的时长跨多次落指累计；下落式（falling）保留经典严格判定：光条头部窗口内落指。
  const holdStart = (lane) => {
    const s = session.current;
    if (
      s.status !== "playing" ||
      !["challenge", "falling"].includes(s.screen) ||
      transport.timeUntilStart > 0 ||
      !LANES[lane]?.hold ||
      s.holding
    )
      return;
    const time = transport.time - options.current.calibration / 1000;
    s.padFlashes[lane] = performance.now();
    const note =
      s.screen === "falling"
        ? closestHoldNote(s.notes, s.results, time, lane)
        : s.notes.find(
            (n) =>
              n.kind === "hold" &&
              n.lane === lane &&
              !s.results[n.id] &&
              time >= n.time - HOLD_LEAD_WINDOW &&
              time < n.end,
          );
    if (note) s.holding = { noteId: note.id, lane, start: time };
    else {
      s.combo = 0;
      s.feedback = {
        grade: "empty",
        label: "这里没有长按光条",
        born: performance.now(),
        serial: `empty-${performance.now()}`,
      };
    }
    publish();
  };
  const holdEnd = (lane) => {
    const s = session.current;
    if (!s.holding || s.holding.lane !== lane) return;
    const holding = s.holding;
    const time = transport.time - options.current.calibration / 1000;
    const note = s.notes.find((n) => n.id === holding.noteId);
    s.holding = null;
    if (note && !s.results[note.id]) {
      if (s.screen === "falling")
        // 下落式：一次按住从头算到尾，按实际时长直接结算（经典规则）。
        resolve(
          note,
          judgementHold(time - holding.start, note.end - note.time),
          time,
        );
      else {
        const len = Math.max(0.01, note.end - note.time);
        const overlap = Math.max(
          0,
          Math.min(time, note.end) - Math.max(holding.start, note.time),
        );
        const accum = (s.holdEngaged[note.id] || 0) + overlap;
        s.holdEngaged = { ...s.holdEngaged, [note.id]: accum };
        if (time >= note.end || accum >= len * 0.8)
          resolve(note, judgementHold(accum, len), time);
        else if (overlap > 0.08)
          s.feedback = {
            grade: "retry",
            label: "按得太短了，再按一次",
            born: performance.now(),
            serial: `retry-${performance.now()}`,
          };
      }
    }
    publish();
  };
  useEffect(() => {
    let raf,
      last = 0,
      lastClick = -1,
      lastStatus = "",
      lastSession = null;
    const tick = (now) => {
      const s = session.current;
      if (s !== lastSession) {
        lastClick = -1;
        lastSession = s;
      }
      if (s.status === "playing") {
        s.time = transport.time;
        s.countdown = transport.timeUntilStart;
        if (s.screen !== "map") {
          // 教练模式不在逐帧里判死：漏没漏由阶段结算面板统一统计。
          if (s.screen !== "challenge") {
            const judgedTime = s.time - options.current.calibration / 1000;
            for (const note of s.notes) {
              if (note.time >= judgedTime - HIT_WINDOW) break;
              if (!s.results[note.id])
                resolve(note, judgement(Infinity), s.time);
            }
          }
          if (options.current.metronome && s.screen === "rhythm") {
            const next = s.notes.find(
              (n) => n.time > s.time && n.time < s.time + 0.09,
            );
            if (next && lastClick !== next.id) {
              lastClick = next.id;
              const ctx = transport.context,
                osc = ctx.createOscillator(),
                gain = ctx.createGain(),
                when = ctx.currentTime + next.time - s.time;
              osc.frequency.value = next.index % 4 === 0 ? 1100 : 760;
              gain.gain.setValueAtTime(0.11, when);
              gain.gain.exponentialRampToValueAtTime(0.001, when + 0.045);
              osc.connect(gain);
              gain.connect(transport.gain);
              osc.start(when);
              osc.stop(when + 0.05);
              osc.onended = () => {
                osc.disconnect();
                gain.disconnect();
              };
            }
          }
        }
        if (transport.phase === "ended") {
          if (s.screen === "map") s.status = "finished";
          else if (s.screen === "challenge") {
            // 教练回合结束：仍按住的长音按“按到结尾”结算；
            // 其余音符保持未决（由阶段面板计为漏）。不写 summary，不弹排行。
            if (s.holding) {
              const note = s.notes.find((n) => n.id === s.holding.noteId);
              if (note && !s.results[note.id]) {
                const len = Math.max(0.01, note.end - note.time);
                const accum =
                  (s.holdEngaged[note.id] || 0) +
                  Math.max(0, note.end - Math.max(s.holding.start, note.time));
                resolve(note, judgementHold(accum, len), s.time);
              }
              s.holding = null;
            }
            s.status = "finished";
          } else {
            // 收尾时仍按住的光条：按已按住时长结算，其余未结算判 miss
            if (s.holding) {
              const note = s.notes.find((n) => n.id === s.holding.noteId);
              const hold = s.time - s.holding.start;
              s.holding = null;
              if (note && !s.results[note.id])
                resolve(note, judgementHold(hold, note.end - note.time), s.time);
            }
            for (const note of s.notes)
              if (!s.results[note.id])
                resolve(note, judgement(Infinity), s.time);
            s.status = "finished";
            s.summary = summarize(s.results, s.notes.length);
            try {
              const key = `qira-v4-${s.screen}-best`,
                best = Number(localStorage.getItem(key) || 0);
              localStorage.setItem(
                key,
                String(Math.max(best, s.summary.score)),
              );
            } catch {}
          }
        }
      }
      if (
        now - last > 15 &&
        (s.status === "playing" ||
          s.status !== lastStatus ||
          (s.feedback && now - s.feedback.born < 500))
      ) {
        setView({ ...s });
        last = now;
        lastStatus = s.status;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const hidden = () => {
      if (document.hidden && session.current.status === "playing") {
        transport.pause();
        session.current.status = "paused";
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", hidden);
      token.current++;
      transport.stop();
    };
  }, []);
  return {
    ...view,
    session,
    beat: manualBpm
      ? {
          bpm: manualBpm,
          offset: humanBeat?.offset ?? beat?.offset ?? 0,
          method: "manual",
        }
      : humanBeat || beat || null,
    detectedBeat: beat,
    humanBeat,
    manualBpm,
    setManualBpm,
    calibration,
    setCalibration,
    speed,
    setSpeed,
    metronome,
    setMetronome,
    navigate,
    start,
    confirm: confirmStart,
    togglePause,
    seek,
    playClip,
    tap,
    holdStart,
    holdEnd,
    finishLesson,
  };
}
