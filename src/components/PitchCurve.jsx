import { useEffect, useRef, useState } from "react";
import { transport } from "../audio/transport.js";
export default function PitchCurve({ game, event, color = "#e3c394" }) {
  const [frames, setFrames] = useState([]),
    [error, setError] = useState(""),
    state = useRef({});
  state.current = { game, event };
  useEffect(() => {
    let worker,
      raf,
      last = 0,
      busy = false,
      epoch = 0,
      source = null,
      history = [];
    try {
      worker = new Worker(
        new URL("../audio/pitch.worker.js", import.meta.url),
        { type: "module" },
      );
    } catch {
      setError("当前浏览器暂时无法分析音高。");
      return;
    }
    worker.onmessage = ({ data }) => {
      busy = false;
      if (data.epoch !== epoch) return;
      history.push(data);
      history = history.filter((f) => f.time > data.time - 12);
      setFrames([...history]);
    };
    worker.onerror = () => {
      busy = false;
      setError("音高分析暂不可用，请继续对照原声聆听。");
    };
    const tick = (now) => {
      const { game } = state.current;
      if (
        game.status === "playing" &&
        transport.phase === "playing" &&
        transport.source &&
        transport.analyser &&
        transport.time >= 0 &&
        !busy &&
        now - last >= 50
      ) {
        if (source !== transport.source) {
          source = transport.source;
          epoch++;
          history = [];
          setFrames([]);
        }
        const samples = new Float32Array(transport.analyser.fftSize);
        transport.analyser.getFloatTimeDomainData(samples);
        busy = true;
        last = now;
        worker.postMessage(
          {
            samples,
            sampleRate: transport.context.sampleRate,
            time: Math.max(
              0,
              transport.time -
                samples.length / transport.context.sampleRate / 2,
            ),
            epoch,
          },
          [samples.buffer],
        );
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      worker.terminate();
    };
  }, []);
  const start = event?.start ?? Math.max(0, game.time - 5),
    end = event?.end ?? Math.max(5, game.time + 1),
    points = frames.filter((f) => f.time >= start && f.time <= end),
    valid = points.filter((f) => f.pitch);
  const midi = (p) => 69 + 12 * Math.log2(p / 440),
    values = valid.map((f) => midi(f.pitch)),
    low = values.length ? Math.floor(Math.min(...values) / 3) * 3 - 3 : 60,
    high = values.length
      ? Math.max(low + 12, Math.ceil(Math.max(...values) / 3) * 3 + 3)
      : 84;
  const px = (t) => 48 + ((t - start) / (end - start)) * 616,
    py = (p) => 155 - ((midi(p) - low) / (high - low)) * 126;
  let path = "",
    previous = null;
  for (const f of points) {
    if (!f.pitch) {
      previous = null;
      continue;
    }
    const connected =
      previous &&
      f.time - previous.time < 0.18 &&
      Math.abs(midi(f.pitch) - midi(previous.pitch)) < 12;
    path += `${connected ? "L" : "M"}${px(f.time).toFixed(2)},${py(f.pitch).toFixed(2)} `;
    previous = f;
  }
  const last = points.at(-1),
    ticks = Array.from({ length: 4 }, (_, i) => low + ((high - low) * i) / 3);
  return (
    <div className="pitch-panel" style={{ "--tech": color }}>
      <div className="pitch-heading">
        <strong>真实音高曲线</strong>
        <span className={game.status === "playing" ? "analyzing-live" : ""}>
          {game.status === "playing" ? "● 播放中实时分析" : "随原声播放生成"}
        </span>
      </div>
      <svg
        viewBox="0 0 700 185"
        role="img"
        aria-label="根据当前录音实时计算的音高曲线，纵轴为赫兹，横轴为秒"
        data-pitch-points={valid.length}
      >
        {ticks.map((v, i) => {
          const y = 155 - ((v - low) / (high - low)) * 126,
            hz = Math.round(440 * 2 ** ((v - 69) / 12));
          return (
            <g key={i}>
              <path
                d={`M48 ${y}H664`}
                stroke="#d6decb20"
                strokeDasharray="3 5"
              />
              <text x="38" y={y + 4} textAnchor="end">
                {hz}
              </text>
            </g>
          );
        })}
        <text x="12" y="16">
          Hz
        </text>
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {[start, (start + end) / 2, end].map((t) => (
          <text key={t} x={px(t)} y="177" textAnchor="middle">
            {t.toFixed(1)} 秒
          </text>
        ))}
        {game.time >= start && game.time <= end && (
          <path d={`M${px(game.time)} 22V155`} stroke="#fff2cf66" />
        )}
        {!valid.length && (
          <text className="pitch-empty" x="356" y="88" textAnchor="middle">
            {error ||
              (["playing", "paused"].includes(game.status)
                ? "正在等待可辨认的音高…"
                : "点击播放，观察曲线如何随声音变化")}
          </text>
        )}
      </svg>
      <div className="pitch-foot">
        <span>
          {last?.pitch
            ? `当前估计 ${Math.round(last.pitch)} Hz`
            : "不稳定的音高保留空白"}
        </span>
        <span>曲线显示音高，声音强弱需结合原声聆听</span>
      </div>
    </div>
  );
}
