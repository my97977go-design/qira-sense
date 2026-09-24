import { useEffect, useMemo, useState } from "react";
import { Play, Pause, RotateCcw, ArrowRight } from "lucide-react";
import { LANES, summarize } from "../game/chart.js";
import {
  COACH_STAGES,
  COACH_PASS_AT,
  coachNotes,
  stageNotes,
  stageLanes,
} from "../game/coachStages.js";
import { Eyebrow, Feedback, running } from "./Elements.jsx";
import TechniqueRibbon, { StageCurve } from "../visuals/TechniqueRibbon.jsx";
import { useKnowledge } from "../knowledge/KnowledgeContext.jsx";

// 教练模式预演的“事件展示窗”：点事件 anchor±0.35，长按取录入起止。
function displayItems(notes, duration) {
  return notes.map((n) => ({
    id: n.id,
    technique: n.technique,
    start: n.kind === "hold" ? n.time : Math.max(0, n.time - 0.35),
    end:
      n.kind === "hold" ? n.end : Math.min(duration, n.time + (n.end ? 0 : 0.35)),
    label: n.label,
    hold: n.kind === "hold",
  }));
}

// 跟练播放前的“3、2、1”预备秒数（ceil 后正好倒数三个数字）；试听不加倒计时。
const PRE_DELAY = 2.6;
// 达标后停留片刻，让指令说完再自动进关。
const AUTO_NEXT_MS = 2800;

export default function Challenge({ game, song }) {
  const { techFor } = useKnowledge();
  const allNotes = useMemo(() => coachNotes(song), [song]);
  const [stageIndex, setStageIndex] = useState(0);
  // intro 认识概念（对照试听段也停留在 intro）→ previewing 听新片段
  // → ready 该上手 → practicing 跟练 → result 阶段结算 → done 全曲完成。
  const [phase, setPhase] = useState("intro");
  const [compareSide, setCompareSide] = useState(null);
  const [rep, setRep] = useState(1);
  const [outcome, setOutcome] = useState(null);
  const stage = COACH_STAGES[stageIndex];
  const stageIds = useMemo(
    () => stageNotes(stage, allNotes).map((n) => n.id),
    [stage, allNotes],
  );
  const practiceNotes = useMemo(
    () => stageNotes(stage, allNotes),
    [stage, allNotes],
  );
  const lanes = useMemo(() => stageLanes(stage, allNotes), [stage, allNotes]);
  // 本段全部音符的完整曲线（一次性同屏展示，而不是单个技法反复切换）。
  const stageItems = useMemo(
    () =>
      displayItems(practiceNotes, song.duration).filter(
        (i) => i.end > stage.from && i.start < stage.to,
      ),
    [practiceNotes, song.duration, stage],
  );

  // 音频进页面就开始加载；试听/跟练都由用户点击触发（满足自动播放策略）。
  useEffect(() => {
    if (game.status === "ready" || game.status === "finished" && !game.summary)
      if (game.session.current.screen !== "challenge") game.start("challenge");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 片段播完（transport ended → status finished）后的阶段状态机。
  useEffect(() => {
    if (game.status !== "finished") return;
    if (phase === "previewing") {
      setPhase("ready");
      return;
    }
    if (phase !== "practicing") return;
    const results = game.session.current.results;
    const hits = stageIds.filter((id) => results[id]?.success).length;
    const rate = stageIds.length ? hits / stageIds.length : 1;
    const passed = rate >= COACH_PASS_AT;
    // 难点段：没过且还有额度 → 自动再来一遍“上、下、上、下”。
    if (!passed && stage.drill && rep < stage.drill.reps) {
      setRep((r) => r + 1);
      game.playClip({
        start: stage.from,
        end: stage.to,
        delay: PRE_DELAY,
        notes: practiceNotes,
        resetIds: stageIds,
      });
      return;
    }
    // 没跟上的方向感：按偏晚多＝太慢，偏早多＝太快，其余是没按到。
    const judged = stageIds.map((id) => results[id]).filter(Boolean);
    const misses = judged.filter(
      (r) => !r.success && Number.isFinite(r.delta),
    );
    const late = misses.filter((r) => r.delta > 0.05).length;
    const early = misses.filter((r) => r.delta < -0.05).length;
    const untouched = stageIds.length - judged.length;
    let pace = "有点没跟上";
    if (late > early && late > 0) pace = "太慢了";
    else if (early > late && early > 0) pace = "太快了";
    else if (untouched > late + early) pace = "有几个音没按到";
    setOutcome({ hits, total: stageIds.length, rate, passed, pace });
    setPhase("result");
  }, [game.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const nextStage = () => {
    setStageIndex((i) => Math.min(COACH_STAGES.length - 1, i + 1));
    setPhase("intro");
    setOutcome(null);
    setCompareSide(null);
    setRep(1);
  };

  // 最终阶段通过 → 写整曲成绩（触发 GameOverlay 结算与排行榜弹窗）。
  useEffect(() => {
    if (phase === "result" && outcome?.passed && stageIndex === COACH_STAGES.length - 1) {
      game.finishLesson(summarize(game.session.current.results, allNotes.length));
      setPhase("done");
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // 达标 → 不点按钮，稍停片刻自动进入下一关。
  useEffect(() => {
    if (phase !== "result" || !outcome?.passed) return;
    if (stageIndex === COACH_STAGES.length - 1) return;
    const timer = setTimeout(nextStage, AUTO_NEXT_MS);
    return () => clearTimeout(timer);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const previewClip = () => {
    const pad = Math.max(0, (2 - (stage.newTo - stage.newFrom)) / 2);
    setPhase("previewing");
    game.playClip({
      start: Math.max(0, stage.newFrom - pad),
      end: Math.min(song.duration, stage.newTo + pad),
      notes: [],
    });
  };
  const startPractice = () => {
    setRep(1);
    setOutcome(null);
    setPhase("practicing");
    game.playClip({
      start: stage.from,
      end: stage.to,
      delay: PRE_DELAY,
      notes: practiceNotes,
      resetIds: stageIds,
    });
  };
  const retryStage = () => {
    setRep(1);
    setOutcome(null);
    startPractice();
  };
  // 对照试听：始终停留在 intro，左右卡可反复点听（即点即听，不加倒计时）。
  const playCompare = (side) => {
    const c = stage.compare[side];
    setCompareSide(side);
    game.playClip({
      start: Math.max(0, c.from - 0.15),
      end: c.to,
      notes: [],
    });
  };

  const t = game.time;
  const clipPlaying = running(game.status);
  const countdown = Math.ceil(game.countdown || 0);
  const now = performance.now();
  const isLast = stageIndex === COACH_STAGES.length - 1;

  // AI 教练对话台词：每个阶段一句明确指令，跟着流程即时切换。
  const instruction = (() => {
    if (phase === "intro")
      return stage.compare
        ? `来听个对比：${stage.compare.hint}`
        : stage.debut
          ? `来认识一下${stage.debut}吧！点击播放，听听是什么样？`
          : `这一关是「${stage.title}」。点击播放，先听一遍！`;
    if (phase === "previewing")
      return "注意听，新的音色就藏在这几个音里。";
    if (phase === "ready") return "听出来了吗？现在，请跟着我一起按吧！";
    if (phase === "practicing")
      return countdown > 0
        ? "预备——手放在板上，跟着我做！"
        : stage.drill
          ? `就是现在！第 ${rep} 遍，跟着按！`
          : "就是现在，跟着我一起按！";
    if (phase === "result")
      return outcome?.passed
        ? isLast
          ? "太棒了，全曲通关！来看看你的成绩。"
          : `漂亮，${outcome.hits} 个音全跟上了！AI 正在匹配下一题……`
        : `${outcome?.pace || "有点没跟上"}，再来一次吧！`;
    return "全曲走完啦，你真棒！";
  })();

  return (
    <section className="play-page challenge-page coach-page">
      <div className="page-heading coach-heading">
        <Eyebrow>技法工坊 · 教练模式</Eyebrow>
        <div className="coach-progress-badge">
          <strong>
            {Math.min(stageIndex + 1, COACH_STAGES.length)}
            <small>/{COACH_STAGES.length}</small>
          </strong>
          <span>阶段</span>
        </div>
      </div>
      <div className="coach-rail" aria-label="训练阶段列表">
        {COACH_STAGES.map((s, i) => (
          <button
            key={s.id}
            className={i === stageIndex ? "current" : i < stageIndex || (i === COACH_STAGES.length - 1 && phase === "done") ? "done" : ""}
            disabled={i > stageIndex && phase !== "done"}
            onClick={() => {
              if (i < stageIndex) {
                setStageIndex(i);
                setPhase("intro");
                setOutcome(null);
                setCompareSide(null);
              }
            }}
            title={s.title}
          >
            <span>{i + 1}</span>
            <b>{s.title}</b>
          </button>
        ))}
      </div>
      <div
        className="atlas-stage coach-stage"
        style={{ "--tech": techFor(stage.focus[0]).color || "#b9b9ab" }}
      >
        <div className="atlas-description coach-chat">
          <span className="chat-meta">
            第 {Math.min(stageIndex + 1, COACH_STAGES.length)} 关 · {stage.title}
            {phase === "practicing" && stage.drill
              ? ` · 第 ${rep}/${stage.drill.reps} 遍`
              : ""}
          </span>
          <p className="chat-line" key={`${stageIndex}-${phase}-${rep}`}>
            {instruction}
          </p>
          <div className="technique-tags">
            {stage.focus.map((f) => (
              <span key={f} style={{ "--tech": techFor(f).color }}>
                {techFor(f).name}
              </span>
            ))}
          </div>
          {phase === "intro" &&
            (stage.compare ? (
              <div className="coach-compare" aria-label="对照试听">
                <div className="compare-buttons">
                  {["left", "right"].map((side) => {
                    const c = stage.compare[side];
                    const isPlaying = compareSide === side && clipPlaying;
                    return (
                      <button
                        key={side}
                        className={`compare-card${isPlaying ? " playing" : ""}`}
                        style={{ "--tech": techFor(c.technique).color }}
                        onClick={() => playCompare(side)}
                      >
                        <TechniqueRibbon mini technique={c.technique} />
                        <b>{c.label}</b>
                        <span>{isPlaying ? "正在播放…" : "点击试听"}</span>
                      </button>
                    );
                  })}
                </div>
                <button className="primary-button coach-start" onClick={startPractice}>
                  听够了，跟一遍 <ArrowRight size={16} />
                </button>
              </div>
            ) : (
              <button className="round-play round-play-invite" onClick={previewClip}>
                <i className="round-play-disc" aria-hidden="true">
                  <Play size={22} fill="currentColor" />
                </i>
                <span>点击播放</span>
              </button>
            ))}
          {phase === "previewing" && (
            <button
              className="round-play"
              onClick={() => game.togglePause()}
              aria-label="暂停试听"
            >
              <i className="round-play-disc" aria-hidden="true">
                {clipPlaying ? <Pause size={22} /> : <Play size={22} fill="currentColor" />}
              </i>
              <span>{clipPlaying ? "正在聆听" : "已暂停，点击继续"}</span>
            </button>
          )}
          {phase === "ready" && (
            <button className="round-play round-play-invite" onClick={startPractice}>
              <i className="round-play-disc" aria-hidden="true">
                <Play size={22} fill="currentColor" />
              </i>
              <span>跟着我，一起按</span>
            </button>
          )}
          {phase === "practicing" && (
            <button className="round-play" onClick={() => game.togglePause()} aria-label="暂停跟练">
              <i className="round-play-disc" aria-hidden="true">
                {clipPlaying ? <Pause size={22} /> : <Play size={22} fill="currentColor" />}
              </i>
              <span>
                {countdown > 0
                  ? "预备……马上开始"
                  : clipPlaying
                    ? "跟练进行中"
                    : "已暂停，点击继续"}
              </span>
            </button>
          )}
          {phase === "result" &&
            !outcome?.passed &&
            !isLast && (
              <button className="primary-button coach-start" onClick={retryStage}>
                再来一次 <RotateCcw size={16} />
              </button>
            )}
        </div>
        <div className="atlas-art">
          <div className="evidence-label">
            完整动作曲线
            <span>本段 {stageItems.length} 个音符一次看全，播放时逐段点亮</span>
          </div>
          <StageCurve
            items={stageItems}
            from={stage.from}
            to={stage.to}
            time={t}
            techFor={techFor}
            playing={clipPlaying}
          />
          {phase === "practicing" &&
            countdown > 0 &&
            countdown <= 3 && (
              <div className="coach-countdown" key={countdown} aria-live="assertive">
                <b>{countdown}</b>
                <span>准备</span>
              </div>
            )}
          {phase === "result" && outcome?.passed && !isLast && (
            <div className="coach-matching" aria-live="polite">
              <i className="matching-pulse" aria-hidden="true"></i>
              <span>AI 正在匹配下一题</span>
            </div>
          )}
          <Feedback game={game} />
        </div>
      </div>
      {phase === "result" && outcome && !outcome.passed && (
        <div className="coach-result">
          <div>
            <strong>
              {outcome.hits}
              <small>/{outcome.total}</small>
            </strong>
            <span>跟上 {Math.round(outcome.rate * 100)}%</span>
          </div>
          <p>
            {`${
              outcome.pace === "太慢了"
                ? "你按偏晚了"
                : outcome.pace === "太快了"
                  ? "你按偏早了"
                  : "你有几个音没按到"
            }，命中率要到 ${Math.round(COACH_PASS_AT * 100)}% 才能进下一关，再来一次！`}
          </p>
        </div>
      )}
      <div className="coach-controls">
        <div className="coach-pads">
          {lanes.map((lane) => {
            const pad = LANES[lane];
            const pressed = now - (game.padFlashes?.[lane] || 0) < 160;
            const holding = game.holding?.lane === lane;
            return (
              <button
                key={lane}
                className={`${pressed ? "pressed" : ""} ${pad.hold ? "hold-pad" : ""} ${holding ? "holding" : ""}`}
                style={{ "--lane": pad.color }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  pad.hold ? game.holdStart(lane) : game.tap(lane);
                }}
                onPointerUp={() => pad.hold && game.holdEnd(lane)}
                onPointerLeave={() => holding && game.holdEnd(lane)}
              >
                <kbd>{pad.key}</kbd>
                <b>{pad.name}</b>
                <span>{pad.hold ? "长按" : "点按"}</span>
              </button>
            );
          })}
        </div>
        <p className="coach-hint">
          {stage.focus.includes("dayin")
            ? "打音=打弓长音：在长音窗口内按住即可，早按晚按都算数，松手太短会提示你再按一次。"
            : "键盘 D/F/J/K 对应四条点按轨；触屏可直接点下方的板。"}
        </p>
      </div>
      {phase === "done" && (
        <div className="coach-result passed">
          <div>
            <strong>41</strong>
            <span>全部音符走过一遍</span>
          </div>
          <p>{stage.celebrate}</p>
        </div>
      )}
    </section>
  );
}
