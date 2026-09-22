import { RankingHint } from "./Ranking.jsx";
import { ArrowRight, Play } from "lucide-react";
import { Eyebrow, Score, Feedback, running, formatBpm } from "./Elements.jsx";
import beatPreview from "../data/beat-preview.json";
// 渐快/渐慢提示文案：预先提示 + 段中解释各一句。
const TEMPO_COPY = {
  accel: {
    title: "渐快",
    soon: "前方渐快 —— 音乐将逐渐提速，拍点会变密，手指跟紧",
    live: "正在渐快 —— 拍点越来越密，别掉拍",
  },
  ritard: {
    title: "渐慢",
    soon: "前方渐慢 —— 音乐将逐渐放宽，把每一拍拉长，别抢拍",
    live: "正在渐慢 —— 拍点拉长，稳住别抢拍",
  },
};
export default function Rhythm({ game }) {
  const bpm = game.beat?.bpm,
    period = 60 / (bpm || beatPreview.bpm),
    phase = ((((game.time - (game.beat?.offset || 0)) / period) % 1) + 1) % 1;
  const pulse =
    game.status === "playing" && !game.countdown ? Math.exp(-phase * 7) : 0;
  const next = game.notes.find(
    (n) => !game.results[n.id] && n.time >= game.time - 0.18,
  );
  const locked =
    running(game.status) || ["loading", "analyzing"].includes(game.status);
  // 预备拍：倒数按当前拍速走满 8 拍，倒数第几拍 → 亮第几个点、显示 8/7/…/1
  const prep = (game.countdownTotal || 0) / 8 || period;
  const prepBeat =
    game.countdown > 0
      ? Math.min(7, Math.max(0, Math.floor((game.countdownTotal - game.countdown) / prep)))
      : -1;
  // 即将进入 / 正处于的渐快渐慢段落
  const marks = game.tempoMarks || [];
  const liveMark = marks.find((m) => game.time >= m.start && game.time <= m.end);
  const soonMark = marks.find(
    (m) => m.start > game.time && m.start - game.time <= Math.max(1.5, period * 4),
  );
  const shownMark = liveMark || soonMark;
  // 圆盘与下方按钮同效：就绪时按它开始，演奏中按它打拍
  // （倒数期间 tap() 内部有 timeUntilStart 守卫，与按钮 disabled 对等）。
  const discTap = () => {
    if (game.status === "ready") game.start("rhythm");
    else if (game.status === "armed") game.confirm();
    else if (game.status === "playing") game.tap(0);
  };
  return (
    <section className="play-page rhythm-page">
      <RankingHint game={game} />
      <div className="page-heading">
        <div>
          <Eyebrow>第一关 · 听见节奏</Eyebrow>
          <h1>跟随音乐，找到节拍</h1>
          <p>听音乐的脉搏，每一拍按一下空格。</p>
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
              : game.humanBeat
                ? "教师人工标定 · 以真实打拍为准"
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
              跟着拍点，一拍按一次。
              <br />
              跟随原声，让手指保持稳定。
            </p>
          </div>
        </aside>
        <div className="pulse-stage">
          {shownMark && !game.countdown && (
            <div
              className={`tempo-mark ${shownMark.trend}${liveMark === shownMark ? " live" : ""}`}
              aria-live="polite"
            >
              <b>{TEMPO_COPY[shownMark.trend].title}</b>
              <small>
                {liveMark === shownMark
                  ? TEMPO_COPY[shownMark.trend].live
                  : TEMPO_COPY[shownMark.trend].soon}
              </small>
            </div>
          )}
          {running(game.status) && game.combo >= 2 && (
            // 连击徽章：每加一次连击 key 变化重弹一次，越连越炸
            <div
              key={game.combo}
              className={`combo-flare ${
                game.combo >= 30 ? "blaze" : game.combo >= 15 ? "hot" : ""
              }`}
              aria-hidden="true"
            >
              <strong>×{game.combo}</strong>
              <span>
                {game.combo >= 30
                  ? "神了！节奏大师！"
                  : game.combo >= 15
                    ? "手很热，别停下！"
                    : "连击成立，保持！"}
              </span>
            </div>
          )}
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
          <div
            className="pulse-disc"
            style={{ "--pulse": pulse }}
            role="button"
            aria-label={
              game.status === "ready" ? "按此开始跟拍" : "按此打拍子"
            }
            onPointerDown={(e) => {
              if (e.button === 0) {
                e.preventDefault();
                discTap();
              }
            }}
            onClick={(e) => {
              if (e.detail === 0) discTap();
            }}
          >
            <span>跟随节拍</span>
            <strong>
              {running(game.status)
                ? Math.max(0, game.combo).toString().padStart(2, "0")
                : "按"}
            </strong>
            <small>
              {running(game.status) ? "连击" : "点一下开始 · 一拍按一下"}
            </small>
          </div>
          <Feedback game={game} />
          <div className="beat-counter">
            {/* 倒数期间走满 8 拍 → 亮 8 个点；演奏中恢复 4/4 拍四点 */}
            {Array.from({ length: game.countdown > 0 ? 8 : 4 }, (_, i) => (
              <i
                key={i}
                className={
                  game.countdown > 0
                    ? i <= prepBeat
                      ? "on"
                      : ""
                    : game.status === "playing" &&
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
            disabled={game.status !== "playing" || game.countdown > 0}
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
            就按这里 <kbd>SPACE</kbd>
            {game.countdown > 0 && (
              // 模拟点击：预备拍每一拍闪一次，示范“怎么跟”
              <i
                key={prepBeat}
                className="tap-demo"
                style={{ animationDuration: `${Math.min(prep, 0.9)}s` }}
              />
            )}
          </button>
        )}
        {game.countdown <= 0 && (
          <small>点击按钮也可以 · 失手后直接跟上下一拍</small>
        )}
      </div>
    </section>
  );
}
