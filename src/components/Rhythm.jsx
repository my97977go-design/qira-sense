import { RankingHint } from "./Ranking.jsx";
import { ArrowRight, Play } from "lucide-react";
import { Eyebrow, Score, Feedback, running, formatBpm } from "./Elements.jsx";
import beatPreview from "../data/beat-preview.json";
export default function Rhythm({ game }) {
  const bpm = game.beat?.bpm,
    period = 120 / (bpm || beatPreview.bpm),
    phase = ((((game.time - (game.beat?.offset || 0)) / period) % 1) + 1) % 1;
  const pulse =
    game.status === "playing" && game.time >= 0 ? Math.exp(-phase * 7) : 0;
  const next = game.notes.find(
    (n) => !game.results[n.id] && n.time >= game.time - 0.18,
  );
  const locked =
    running(game.status) || ["loading", "analyzing"].includes(game.status);
  return (
    <section className="play-page rhythm-page">
      <RankingHint game={game} />
      <div className="page-heading">
        <div>
          <Eyebrow>第一关 · 听见节奏</Eyebrow>
          <h1>跟随音乐，找到节拍</h1>
          <p>听音乐的脉搏，每两拍按一下空格。</p>
        </div>
        <Score game={game} />
      </div>
      <div className="rhythm-layout">
        <aside className="rhythm-info">
          <span className="small-label">音乐拍速</span>
          <div className="bpm-display">
            {bpm ? formatBpm(bpm) : "—"}
            <small>BPM</small>
          </div>
          <p>
            {game.manualBpm
              ? "手动拍速"
              : bpm
                ? "从当前录音自动估算"
                : "开始后自动分析录音"}
          </p>
          <div className="tempo-options">
            <button
              disabled={locked}
              onClick={() =>
                game.setManualBpm(Math.max(30, (bpm || beatPreview.bpm) / 2))
              }
            >
              ½ 速
            </button>
            <button
              disabled={locked}
              onClick={() => game.setManualBpm(null)}
              className={!game.manualBpm ? "selected" : ""}
            >
              自动
            </button>
            <button
              disabled={locked}
              onClick={() =>
                game.setManualBpm(Math.min(300, (bpm || beatPreview.bpm) * 2))
              }
            >
              2 倍
            </button>
          </div>
          <label className="switch-label">
            <input
              type="checkbox"
              checked={game.metronome}
              onChange={(e) => game.setMetronome(e.target.checked)}
            />
            <span />
            节拍辅助音
          </label>
          <div className="quiet-note">
            <span>小提示</span>
            <p>
              数“一、二”，每两拍按一次。
              <br />
              跟随原声，让手指保持稳定。
            </p>
          </div>
        </aside>
        <div className="pulse-stage">
          <div className="pulse-orbit outer" />
          <div className="pulse-orbit middle" />
          {game.status === "playing" &&
            game.notes
              .filter(
                (n) => n.time >= game.time && n.time - game.time < period * 2,
              )
              .map((n) => (
                <div
                  key={n.id}
                  className="approach-ring"
                  style={{
                    transform: `translate(-50%,-50%) scale(${1 + ((n.time - game.time) / period) * 0.45})`,
                    opacity: 1 - ((n.time - game.time) / period) * 0.35,
                  }}
                />
              ))}
          <div className="pulse-disc" style={{ "--pulse": pulse }}>
            <span>跟随节拍</span>
            <strong>
              {running(game.status)
                ? Math.max(0, game.combo).toString().padStart(2, "0")
                : "拍"}
            </strong>
            <small>{running(game.status) ? "连击" : "两拍 · 一次触碰"}</small>
          </div>
          <Feedback game={game} />
          <div className="beat-counter">
            {[0, 1, 2, 3].map((i) => (
              <i
                key={i}
                className={
                  game.status === "playing" &&
                  game.time >= 0 &&
                  (next?.index || 0) % 4 === i
                    ? "on"
                    : ""
                }
              />
            ))}
          </div>
        </div>
        <aside className="rhythm-side">
          <span className="small-label">聆听提示</span>
          <p>
            不抢拍，
            <br />
            不掉拍。
          </p>
          <div className="timing-legend">
            <span>
              <i />
              精准 <b>±70 ms</b>
            </span>
            <span>
              <i />
              命中 <b>±180 ms</b>
            </span>
          </div>
        </aside>
      </div>
      <div className="rhythm-bottom">
        {game.status === "ready" ? (
          <button
            className="primary-button"
            onClick={() => game.start("rhythm")}
          >
            <Play size={16} fill="currentColor" /> 分析节拍，开始测试{" "}
            <ArrowRight size={17} />
          </button>
        ) : (
          <button
            className="tap-button"
            disabled={game.status !== "playing" || game.time < 0}
            onPointerDown={(e) => {
              if (e.button === 0) {
                e.preventDefault();
                game.tap(0);
              }
            }}
            onClick={(e) => {
              if (e.detail === 0) game.tap(0);
            }}
          >
            <span />
            跟上这一拍 <kbd>SPACE</kbd>
          </button>
        )}
        <small>点击按钮也可以 · 失手后直接跟上下一拍</small>
      </div>
    </section>
  );
}
