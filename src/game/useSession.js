import { useEffect, useRef, useState } from "react";
import { transport } from "../audio/transport.js";
import {
  makeChart,
  closestNote,
  judgement,
  summarize,
  HIT_WINDOW,
} from "./chart.js";

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
  notes: [],
  results: {},
  combo: 0,
  feedback: null,
  padFlashes: [0, 0, 0, 0],
  summary: null,
  error: "",
});
export default function useSession(song) {
  const session = useRef(initial()),
    token = useRef(0),
    [view, setView] = useState(session.current);
  const [beat, setBeat] = useState(null),
    [manualBpm, setManualBpm] = useState(null),
    [calibration, setCalibration] = useState(0),
    [speed, setSpeed] = useState(1),
    [metronome, setMetronome] = useState(false);
  const options = useRef({});
  options.current = { song, beat, manualBpm, calibration, speed, metronome };
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
      let analysis = options.current.beat;
      if (screen !== "map" && !analysis && !options.current.manualBpm) {
        session.current.status = "analyzing";
        publish();
        analysis = await detectBeat(transport.buffer);
        if (request !== token.current) return;
        setBeat(analysis);
        options.current.beat = analysis;
      }
      if (request !== token.current) return;
      const effective = {
        ...(analysis || {}),
        bpm: options.current.manualBpm || analysis?.bpm,
        offset: analysis?.offset || 0,
      };
      session.current.notes =
        screen === "map" ? [] : makeChart(song, effective, screen);
      if (screen !== "map" && !session.current.notes.length)
        throw new Error("无法生成节拍，请设置 BPM 后重试。");
      session.current.status = "playing";
      session.current.time = screen === "map" ? 0 : -2.5;
      transport.play(0, screen === "map" ? 0 : 2.5);
      publish();
    } catch (error) {
      if (request === token.current) {
        session.current.status = "error";
        session.current.error = error.message;
        publish();
      }
    }
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
      !["rhythm", "challenge"].includes(s.screen) ||
      transport.time < 0
    )
      return;
    const time = transport.time - options.current.calibration / 1000;
    s.padFlashes[lane] = performance.now();
    const note = closestNote(s.notes, s.results, time, lane);
    if (note) resolve(note, judgement(time - note.time), time);
    else {
      s.combo = 0;
      s.feedback = {
        grade: "empty",
        label: "跟上下一拍",
        born: performance.now(),
        serial: `empty-${performance.now()}`,
      };
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
        if (s.screen !== "map") {
          const judgedTime = s.time - options.current.calibration / 1000;
          for (const note of s.notes) {
            if (note.time >= judgedTime - HIT_WINDOW) break;
            if (!s.results[note.id]) resolve(note, judgement(Infinity), s.time);
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
          else {
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
    beat: beat
      ? { ...beat, bpm: manualBpm || beat.bpm }
      : manualBpm
        ? { bpm: manualBpm, offset: 0, method: "manual" }
        : null,
    detectedBeat: beat,
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
    togglePause,
    seek,
    tap,
    finishLesson,
  };
}
