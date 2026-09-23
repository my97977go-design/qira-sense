import { RankingHint } from "./Ranking.jsx";
import { ArrowRight, Play, Disc3 } from "lucide-react";
import { LANES, activeAt, makeChart } from "../game/chart.js";
import { Eyebrow, Score, Feedback, formatBpm } from "./Elements.jsx";
import Highway from "./Highway.jsx";
import { useKnowledge } from "../knowledge/KnowledgeContext.jsx";
import TechniqueRibbon from "../visuals/TechniqueRibbon.jsx";
import beatPreview from "../data/beat-preview.json";
export default function Challenge({ game, song }) {
  const { techFor } = useKnowledge();
  const preview = makeChart(song, game.beat || beatPreview),
    active = activeAt(song, game.time),
    tech = active ? techFor(active.technique) : null;
  return (
    <section className="play-page challenge-page">
      <RankingHint game={game} />
      <div className="page-heading">
        <div>
          <Eyebrow>隐藏彩蛋 · 光弦坠落</Eyebrow>
          <h1>与光同行，在演奏中理解技法</h1>
          <p>点技法到线即点；长按技法按住光条，时长大差不差即可。</p>
        </div>
        <Score game={game} />
      </div>
      <div className="challenge-layout">
        <aside className="challenge-left">
          <div className="challenge-track">
            <Disc3 size={25} />
            <span>正在挑战</span>
            <h2>大起板</h2>
            <p>高音板胡 · 原声片段</p>
          </div>
          <div className="challenge-facts">
            <span>
              <b>{formatBpm(game.beat?.bpm || beatPreview.bpm)}</b> BPM{" "}
              <small>{game.manualBpm ? "手动" : "估算"}</small>
            </span>
            <span>
              <b>{game.notes.length || preview.length}</b> 次触碰
            </span>
            <span>
              <b>07</b> 条音轨
            </span>
          </div>
          <div className="combo-box">
            <strong>{game.combo.toString().padStart(2, "0")}</strong>
            <span>连击</span>
            <p>
              {game.combo >= 10 ? "继续，手感正好。" : "从这一拍，连起来。"}
            </p>
          </div>
          <label className="speed-control">
            <span>
              下落速度 <b>{game.speed.toFixed(1)}×</b>
            </span>
            <input
              type="range"
              min=".7"
              max="1.5"
              step=".1"
              value={game.speed}
              onChange={(e) => game.setSpeed(Number(e.target.value))}
            />
            <small>只改变视觉速度，音乐保持原速</small>
          </label>
        </aside>
        <div className="highway-wrap">
          {game.countdown > 0 && (
            <div className="count-in" aria-live="polite">
              <b key={Math.ceil(game.countdown)}>{Math.ceil(game.countdown)}</b>
              <small>第一个声音随节拍进场</small>
            </div>
          )}
          <Highway game={game} previewNotes={preview} />
          <Feedback game={game} />
          {game.status === "ready" && (
            <div className="start-curtain">
              <span className="small-label">连续演奏 · 技法与声音对应</span>
              <h2>完成这段技法挑战</h2>
              <p>
                点技法按 D / F / J / K，
                <br />
                长按光条按住 1 / 2 / 3，或直接点按音轨。
              </p>
              <div className="key-demo">
                {LANES.map((l) => (
                  <kbd key={l.key} style={{ "--lane": l.color }}>
                    {l.key}
                  </kbd>
                ))}
              </div>
              <button
                className="primary-button"
                onClick={() => game.start("challenge")}
              >
                <Play size={15} fill="currentColor" /> 开始连奏{" "}
                <ArrowRight size={16} />
              </button>
              <small>38.88 秒，一次流畅的挑战</small>
            </div>
          )}
        </div>
        <aside className="challenge-right">
          <span className="small-label">听见变化，理解表现</span>
          <div
            className="live-technique"
            style={{ "--tech": tech?.color || "#b7b9ad" }}
          >
            <span>{tech ? "此刻的技法" : "让节奏继续"}</span>
            <h2>{tech?.name || "节拍"}</h2>
            <TechniqueRibbon mini technique={tech?.id || "vibrato"} />
            <p>
              {active
                ? LANES.find((l) => l.ids.includes(active.technique))?.hold
                  ? `持续状态 · 按住 ${
                      LANES.find((l) => l.ids.includes(active.technique)).key
                    } 号光条，约 ${(active.end - active.start).toFixed(1)} 秒`
                  : active.dynamics === "crescendo"
                    ? "渐强推进，接住每一下"
                    : active.dynamics === "diminuendo"
                      ? "渐弱收束，接住每一下"
                      : active.repeatCount > 1
                        ? `连续 ${active.repeatCount} 次，接住每一下`
                        : tech.description
                : "浅色短音符是衔接节拍，按对应音轨即可。"}
            </p>
          </div>
          <div className="lane-guide">
            {LANES.map((l) => (
              <div
                key={l.key}
                className={l.hold ? "hold" : ""}
                style={{ "--lane": l.color }}
              >
                <kbd>{l.key}</kbd>
                <span>
                  {l.name}
                  {l.hold && <i>长按</i>}
                </span>
              </div>
            ))}
          </div>
          <p className="play-hint">
            漏掉一拍也没关系。
            <br />
            眼睛向前，接住下一个。
          </p>
        </aside>
      </div>
    </section>
  );
}
