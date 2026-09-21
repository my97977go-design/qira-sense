import { useEffect, useRef, useState } from "react";
import { transport } from "./transport.js";

// 可复用的短片段播放能力：基于同一个 transport / AudioContext，
// 不触碰课程 session 的 screen 状态。供标注台、自适应学习、技法资料库使用。
export default function useClipPlayer(audioUrl) {
  const [clip, setClip] = useState(null); // { start, end, loop, key }
  const [status, setStatus] = useState("idle"); // idle | loading | playing | paused
  const [time, setTime] = useState(0);
  const raf = useRef(0);
  const clipRef = useRef(null);
  clipRef.current = clip;

  useEffect(() => {
    const tick = () => {
      const c = clipRef.current;
      if (c && transport.phase === "playing") {
        const t = transport.time;
        if (t >= c.end - 0.004) {
          if (c.loop) transport.play(c.start, 0, c.end);
          else {
            setStatus("idle");
            setClip(null);
            setTime(c.start);
            return;
          }
        }
        setTime(transport.time);
      } else if (transport.phase === "paused") setStatus("paused");
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  const playClip = async (start, end, { loop = false, key = null } = {}) => {
    try {
      setStatus("loading");
      await transport.load(audioUrl);
      const next = { start, end, loop, key };
      setClip(next);
      clipRef.current = next;
      transport.play(start, 0, end);
      setStatus("playing");
      setTime(start);
      return true;
    } catch {
      setStatus("idle");
      setClip(null);
      return false;
    }
  };
  const stop = () => {
    transport.stop();
    setClip(null);
    setStatus("idle");
    setTime(0);
  };
  const pause = () => {
    if (transport.phase === "playing") {
      transport.pause();
      setStatus("paused");
    }
  };
  useEffect(() => stop, []);
  return { playClip, stop, pause, clip, status, time };
}
