import { useState } from "react";
import { Play, RotateCcw, ArrowRight, Check, X, Sparkles } from "lucide-react";
import useClipPlayer from "../audio/useClipPlayer.js";
import useLearner, { nextQuestion, samplesData } from "../learning/useLearner.js";
import { FINAL_TECHNIQUES } from "../learning/learningConfig.js";
import { useKnowledge } from "../knowledge/KnowledgeContext.jsx";
import { Eyebrow } from "./Elements.jsx";

const SAMPLES = samplesData.samples || [];

// 自适应技法学习：弱项驱动选题，记录混淆，绝不提交排行榜。
export default function AdaptiveLearning({ game, song }) {
  const { techFor } = useKnowledge();
  const player = useClipPlayer(song.audio);
  const learner = useLearner();
  const [question, setQuestion] = useState(() =>
    nextQuestion(learner.state, SAMPLES),
  );
  const [picked, setPicked] = useState(null);
  const [revealed, setRevealed] = useState(false);

  const ask = () => {
    setQuestion(nextQuestion(learner.state, SAMPLES));
    setPicked(null);
    setRevealed(false);
  };
  const play = () => {
    if (!question) return;
    player.playClip(question.sample.start, question.sample.end, {
      key: question.sample.id,
    });
  };
  const choose = (choice) => {
    if (!question || revealed) return;
    setPicked(choice);
    setRevealed(true);
    learner.recordAnswer({
      sample: question.sample,
      answer: question.answer,
      choice,
      correct: choice === question.answer,
    });
  };

  const accuracy = (t) => {
    const s = learner.state.techniques[t];
    return s && s.attempts ? Math.round((s.correct / s.attempts) * 100) : null;
  };
  const confusionPairs = Object.entries(learner.state.confusion)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const answerTech = question ? techFor(question.answer) : null;
  const totalAttempts = Object.values(learner.state.techniques).reduce(
    (s, t) => s + t.attempts,
    0,
  );

  return (
    <section className="play-page learning-page">
      <div className="page-heading">
        <div>
          <Eyebrow>技法训练 · 自适应学习</Eyebrow>
          <h1>把不同声音真正记住</h1>
          <p>
            系统根据你的弱项挑选片段；这不是竞赛，不计入排行榜。
          </p>
        </div>
        <button className="text-button" onClick={() => game.navigate("home")}>
          返回课程
        </button>
      </div>

      {!question ? (
        <p className="learning-empty">
          暂无可用样本。请等待教师补充语境样本或标准样本。
        </p>
      ) : (
        <div className="learning-layout">
          <div className="learning-main">
            <div className="learning-sample">
              <span className="small-label">
                {question.sample.kind === "canonical"
                  ? "标准独立样本"
                  : "语境样本 · 取自《大起板》人工确认区间"}
              </span>
              <h2>{question.sample.label}</h2>
              <p>
                {question.sample.start.toFixed(1)}—
                {question.sample.end.toFixed(1)} 秒 · 可反复聆听
              </p>
              <div className="learning-play-row">
                <button
                  className="primary-button"
                  onClick={play}
                  disabled={player.status === "loading"}
                >
                  {player.status === "playing" ? (
                    <RotateCcw size={16} />
                  ) : (
                    <Play size={16} />
                  )}
                  {player.status === "playing" ? "正在播放" : "播放片段"}
                </button>
                {player.status === "playing" && (
                  <button className="text-button" onClick={player.stop}>
                    停止
                  </button>
                )}
              </div>
            </div>

            <div className="learning-question">
              <h3>这段声音，主要使用了哪种技法？</h3>
              <div className="learning-choices">
                {question.choices.map((id) => {
                  const t = techFor(id);
                  const isAnswer = id === question.answer;
                  let cls = "";
                  if (revealed)
                    cls = isAnswer ? "correct" : id === picked ? "wrong" : "";
                  return (
                    <button
                      key={id}
                      className={cls}
                      disabled={revealed}
                      onClick={() => choose(id)}
                      style={{ "--tech": t.color }}
                    >
                      <span
                        className="choice-dot"
                        style={{ background: t.color }}
                      />
                      {t.name}
                      {revealed && isAnswer && <Check size={17} />}
                      {revealed && id === picked && !isAnswer && (
                        <X size={17} />
                      )}
                    </button>
                  );
                })}
              </div>
              <p
                className={`learning-feedback ${revealed ? (picked === question.answer ? "correct" : "wrong") : ""}`}
                role="status"
              >
                {!revealed
                  ? "听完片段后选择一个答案。答错会记录混淆，之后会多练。"
                  : picked === question.answer
                    ? `正确。${answerTech?.shortExplanation || ""}`
                    : `正确答案是「${answerTech?.name}」。${answerTech?.commonConfusion || answerTech?.shortExplanation || ""}`}
              </p>
              {revealed && (
                <button className="primary-button" onClick={ask}>
                  下一题
                  <ArrowRight size={17} />
                </button>
              )}
            </div>
          </div>

          <aside className="learning-side">
            <div className="learning-stats">
              <span className="small-label">
                各技法掌握度 · 共作答 {totalAttempts} 次
              </span>
              {FINAL_TECHNIQUES.map((t) => {
                const tech = techFor(t);
                const acc = accuracy(t);
                const s = learner.state.techniques[t];
                return (
                  <div key={t} className="stat-row">
                    <span
                      className="stat-dot"
                      style={{ background: tech.color }}
                    />
                    <b>{tech.name}</b>
                    <small>
                      {acc === null
                        ? "未作答"
                        : `${acc}% · ${s.correct}/${s.attempts}`}
                    </small>
                  </div>
                );
              })}
            </div>
            {confusionPairs.length > 0 && (
              <div className="learning-confusion">
                <span className="small-label">容易混淆</span>
                {confusionPairs.map(([key, n]) => {
                  const [real, wrong] = key.split(">");
                  return (
                    <div key={key} className="confusion-row">
                      <b>{techFor(real).name}</b>
                      <span>常被误认为</span>
                      <b>{techFor(wrong).name}</b>
                      <small>×{n}</small>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="learning-note">
              <Sparkles size={15} />
              <p>
                当前使用《大起板》语境样本训练；标准独立样本待补充后自动加入。
              </p>
            </div>
            <button className="text-button" onClick={learner.reset}>
              重置学习记录
            </button>
          </aside>
        </div>
      )}
    </section>
  );
}
