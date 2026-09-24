import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Square, RotateCcw, AlertTriangle, Flame } from "lucide-react";
import { transport } from "../audio/transport.js";
import { COUNT_IN_SECONDS, detectLeadSilence } from "../audio/leadIn.js";
import { selectOfficialEvents, scoreFinalTest } from "../learning/finalTest.js";
import {
  FINAL_TECHNIQUES,
  FINAL_TEST_TOLERANCE_MS,
  finalTestPassRule,
  kindOf,
} from "../learning/learningConfig.js";
import { useKnowledge } from "../knowledge/KnowledgeContext.jsx";
import { Eyebrow, clock } from "./Elements.jsx";
import PulseLine from "./PulseLine.jsx";
import baseFeatures from "../data/features.json";

// 演示模式下的临时答案：旧区间等分位置，明确标记为非正式。
function provisionalEvents(song) {
  const events = [];
  for (const a of song.annotations.filter((x) => x.enabled !== false)) {
    const n = Math.max(1, a.repeatCount || 1);
    for (let i = 0; i < n; i++)
      events.push({
        id: `prov-${a.id}-${i}`,
        annotationId: a.id,
        technique: a.technique,
        anchor: a.start + (i * (a.end - a.start)) / n,
        timingPrecision: "legacy-derived-subdivision",
        reviewStatus: "needs-review",
      });
  }
  return events.sort((x, y) => x.anchor - y.anchor);
}

const PERFECT_MS = 60; // ±60ms 内判「正中」

// 游戏难度：倍速越慢越容易（反应时间更充裕），原速为困难。
const DIFFICULTIES = [
  { id: "hard", label: "困难", rate: 1, note: "原速 · 真实挑战" },
  { id: "medium", label: "中等", rate: 0.75, note: "稍慢 · 更好捕捉" },
  { id: "easy", label: "容易", rate: 0.5, note: "慢速 · 反应更充裕" },
];

// 快速听辨测试（游戏化）：整曲连续播放、无提示、独立技法按钮与事件匹配评分。
// 不复用四轨 laneOf；不提交排行榜。连击 / 判定动画 / 偏差毫秒 / 音乐曲线。
export default function FinalListeningTest({ game, song }) {
  const { techFor } = useKnowledge();
  const [phase, setPhase] = useState("ready"); // ready | playing | done
  const [difficulty, setDifficulty] = useState("hard");
  const [responses, setResponses] = useState([]);
  const [time, setTime] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [score, setScore] = useState(0);
  const [judge, setJudge] = useState(null); // { serial, kind, ms, technique, expected }
  const [pressed, setPressed] = useState(null); // { serial, technique }
  const endTimeRef = useRef(song.duration);
  const responsesRef = useRef([]);
  const usedRef = useRef(new Set());
  const judgeSeq = useRef(0);
  responsesRef.current = responses;

  const { events, official, missingTechniques } = selectOfficialEvents(song);
  const answerEvents = official ? events : provisionalEvents(song);
  const answerRef = useRef(answerEvents);
  answerRef.current = answerEvents;
  const tol = FINAL_TEST_TOLERANCE_MS / 1000;
  const techColors = useMemo(
    () => Object.fromEntries(FINAL_TECHNIQUES.map((t) => [t, techFor(t).color])),
    [techFor],
  );

  // 播放时钟 + 漏检判定（事件超过容差仍未响应 → miss）。
  useEffect(() => {
    if (phase !== "playing") return;
    let raf;
    const tick = () => {
      if (transport.phase === "playing") {
        const t = transport.time;
        setTime(t);
        setCountdown(transport.timeUntilStart);
        if (transport.timeUntilStart <= 0)
          for (const ev of answerRef.current) {
            if (usedRef.current.has(ev.id)) continue;
            if (t - ev.anchor > tol) {
              usedRef.current.add(ev.id);
              setCombo(0);
              showJudge({ kind: "miss", technique: ev.technique });
            }
          }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // 离开页面：停止播放并恢复原速，避免慢速残留到其他页面。
  useEffect(
    () => () => {
      transport.stop();
      transport.setRate(1);
    },
    [],
  );

  const showJudge = (j) => {
    judgeSeq.current += 1;
    setJudge({ ...j, serial: judgeSeq.current });
  };

  useEffect(() => {
    const key = (e) => {
      if (phase !== "playing" || e.repeat || e.ctrlKey || e.altKey || e.metaKey)
        return;
      const i = [
        "Digit1",
        "Digit2",
        "Digit3",
        "Digit4",
        "Digit5",
        "Digit6",
        "Digit7",
        "Digit8",
      ].indexOf(e.code);
      if (i >= 0 && FINAL_TECHNIQUES[i]) {
        e.preventDefault();
        record(FINAL_TECHNIQUES[i]);
      } else if (e.code === "Space") {
        e.preventDefault();
        finish();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const start = async () => {
    setError("");
    try {
      await transport.load(song.audio);
      transport.setRate(
        DIFFICULTIES.find((d) => d.id === difficulty)?.rate ?? 1,
      );
      setResponses([]);
      setResult(null);
      setCombo(0);
      setMaxCombo(0);
      setScore(0);
      setJudge(null);
      usedRef.current = new Set();
      endTimeRef.current = song.duration;
      // 3-2-1 倒数（0 不显示）：头部空白计入倒数，第一个声音正好落在 0
      const lead = detectLeadSilence(transport.buffer);
      transport.play(lead, COUNT_IN_SECONDS, song.duration);
      setPhase("playing");
      setTime(lead - COUNT_IN_SECONDS);
      setCountdown(COUNT_IN_SECONDS);
    } catch (e) {
      setError(e.message || "录音加载失败，请重试。");
    }
  };

  // 打点 + 实时判定（仅演出反馈；最终成绩仍由 scoreFinalTest 统一计算）。
  const record = (technique) => {
    if (
      phase !== "playing" ||
      transport.phase !== "playing" ||
      transport.timeUntilStart > 0
    )
      return;
    const t = transport.time;
    setResponses((r) => [...r, { time: t, technique }]);
    judgeSeq.current += 1;
    setPressed({ serial: judgeSeq.current, technique });
    let best = null;
    for (const ev of answerEvents) {
      if (usedRef.current.has(ev.id)) continue;
      const d = Math.abs(ev.anchor - t);
      if (d <= tol && (!best || d < best.d)) best = { ev, d };
    }
    if (!best) {
      setCombo(0);
      setJudge({ kind: "fp", technique, serial: judgeSeq.current });
      return;
    }
    usedRef.current.add(best.ev.id);
    const ms = Math.round((t - best.ev.anchor) * 1000);
    if (best.ev.technique === technique) {
      const perfect = Math.abs(ms) <= PERFECT_MS;
      setCombo((c) => {
        const next = c + 1;
        setMaxCombo((m) => Math.max(m, next));
        setScore((s) => s + (perfect ? 100 : 60) + Math.min(next, 20) * 5);
        return next;
      });
      setJudge({
        kind: perfect ? "perfect" : "good",
        ms,
        technique,
        serial: judgeSeq.current,
      });
    } else {
      setCombo(0);
      setJudge({
        kind: "wrong",
        ms,
        technique,
        expected: best.ev.technique,
        serial: judgeSeq.current,
      });
    }
  };

  const finish = () => {
    if (phase !== "playing") return;
    endTimeRef.current = Math.min(transport.time, song.duration);
    transport.stop();
    grade(endTimeRef.current);
  };

  const grade = (endTime) => {
    const graded = answerEvents.filter((e) => e.anchor <= endTime + 0.001);
    const summary = scoreFinalTest(
      responsesRef.current,
      graded,
      FINAL_TEST_TOLERANCE_MS,
    );
    const f1 = summary.overall.f1 ?? 0;
    const passed =
      official && f1 >= finalTestPassRule.threshold && graded.length > 0;
    const result = {
      ...summary,
      official,
      gradedCount: graded.length,
      endTime,
      f1,
      passed,
    };
    setResult(result);
    setPhase("done");
    if (passed)
      game.course.complete("finalTest", {
        passed: true,
        accuracy: Math.round(f1 * 100),
        f1,
        precision: summary.overall.precision,
        recall: summary.overall.recall,
        official: true,
      });
  };

  // 播放自然结束时自动计分。
  useEffect(() => {
    if (phase === "playing" && transport.phase === "ended") {
      endTimeRef.current = song.duration;
      grade(song.duration);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
  const weak = result
    ? FINAL_TECHNIQUES.filter((t) => {
        const p = result.perTechnique[t];
        return p && p.tp + p.misclassified + p.fn + p.fp > 0 && (p.f1 ?? 0) < 0.6;
      })
    : [];
  const judgeText = {
    perfect: "正中",
    good: "命中",
    wrong: "认错技法",
    miss: "错过",
    fp: "误报",
  };

  return (
    <section className="play-page finaltest-page">
      <div className="page-heading">
        <div>
          <Eyebrow>快速听辨测试 · 无提示整曲识别</Eyebrow>
          <h1>没有提示，你能听出多少？</h1>
          <p>
            完整《大起板》连续播放。听到技法出现的瞬间，点击对应按钮或按数字键
            1—5。没有下落提示，没有节拍填充，不计入排行榜。
          </p>
        </div>
        <button className="text-button" onClick={() => game.navigate("home")}>
          返回课程
        </button>
      </div>

      {!official && (
        <div className="finaltest-banner" role="status">
          <AlertTriangle size={17} />
          <div>
            <b>演示模式（Provisional Test）</b>
            <p>
              当前部分技法仍使用旧版区间标注，完整精确测验需完成教师精细标注。
              演示答案来自旧区间等分位置，不作为正式毫秒级成绩；通过本章需正式数据。
              {missingTechniques.length > 0 &&
                ` 尚缺毫秒级事件的技法：${missingTechniques
                  .map((t) => techFor(t).name)
                  .join("、")}。`}
            </p>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="finaltest-error">
          {error}
        </p>
      )}

      {phase !== "done" && (
        <div className="finaltest-stage">
          <div className="finaltest-hud">
            <div className="hud-score">
              <span>得分</span>
              <strong>{score.toString().padStart(6, "0")}</strong>
            </div>
            <div className={`hud-combo ${combo >= 5 ? "hot" : ""}`}>
              <Flame size={16} />
              <strong>×{combo}</strong>
              <span>连击</span>
            </div>
            <div className="hud-meta">
              <span>已记录 {responses.length} 次</span>
              <time>
                {clock(time)} / {clock(song.duration)}
              </time>
            </div>
          </div>

          <div className="finaltest-arena">
            {countdown > 0 && (
              <div className="count-in" aria-live="polite">
                <b key={Math.ceil(countdown)}>{Math.ceil(countdown)}</b>
                <small>第一个声音落在 0</small>
              </div>
            )}
            <PulseLine
              frames={baseFeatures.frames}
              time={phase === "playing" ? time : 0}
              duration={song.duration}
              events={answerEvents}
              colors={techColors}
              windowSec={7}
              height={150}
            />
            {judge && phase === "playing" && (
              <div key={judge.serial} className={`judge judge-${judge.kind}`} role="status">
                <strong>{judgeText[judge.kind]}</strong>
                {Number.isFinite(judge.ms) && (
                  <small>
                    {judge.ms === 0
                      ? "分毫不差"
                      : `${Math.abs(judge.ms)} ms ${judge.ms < 0 ? "偏早" : "偏晚"}`}
                  </small>
                )}
                {judge.kind === "miss" && (
                  <small>{techFor(judge.technique).name} 溜走了</small>
                )}
                {judge.kind === "wrong" && judge.expected && (
                  <small>
                    你按了{techFor(judge.technique).name}，实为
                    {techFor(judge.expected).name}
                  </small>
                )}
              </div>
            )}
            {combo > 0 && combo % 10 === 0 && phase === "playing" && (
              <div key={`milestone-${combo}`} className="judge judge-milestone">
                <strong>COMBO ×{combo}</strong>
              </div>
            )}
          </div>

          <div className="finaltest-controls">
            {phase === "ready" && (
              <>
                <div
                  className="finaltest-difficulty"
                  role="group"
                  aria-label="游戏难度"
                >
                  <span>游戏难度</span>
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d.id}
                      className={difficulty === d.id ? "active" : ""}
                      onClick={() => setDifficulty(d.id)}
                    >
                      <b>{d.label}</b>
                      <small>{d.note}</small>
                    </button>
                  ))}
                </div>
                <button className="primary-button" onClick={start}>
                  <Play size={17} />
                  开始整曲测试
                </button>
              </>
            )}
            {phase === "playing" && (
              <button className="secondary-button" onClick={finish}>
                <Square size={15} />
                结束并计分（空格）
              </button>
            )}
          </div>

          <div className="finaltest-buttons">
            {FINAL_TECHNIQUES.map((t, i) => {
              const tech = techFor(t);
              const flashing = pressed?.technique === t;
              const hold = kindOf(t) === "hold";
              return (
                <button
                  key={flashing ? `${t}-${pressed.serial}` : t}
                  className={`finaltest-tech ${flashing ? "flash" : ""} ${
                    hold ? "hold" : ""
                  }`}
                  style={{ "--tech": tech.color }}
                  disabled={phase !== "playing" || countdown > 0}
                  onClick={() => record(t)}
                >
                  <kbd>{i + 1}</kbd>
                  <b>{tech.name}</b>
                  <i>{hold ? "长按" : "点"}</i>
                </button>
              );
            })}
          </div>
          <p className="finaltest-hint">
            {phase === "playing"
              ? "只在真正听到技法变化时点击；误点会记为误报。"
              : "判定容差 ±" +
                FINAL_TEST_TOLERANCE_MS +
                "ms · 事件级匹配 · 精确率 / 召回率 / F1"}
          </p>
        </div>
      )}

      {phase === "done" && result && (
        <div className="finaltest-result">
          <div className="finaltest-result-head">
            <div>
              <span className="small-label">
                {result.official ? "正式测验结果" : "演示模式结果（非正式）"}
              </span>
              <h2>
                {result.passed
                  ? "达到本章掌握标准"
                  : result.official
                    ? "尚未达到掌握标准"
                    : "演示结果仅供参考"}
              </h2>
              <p>
                计分事件 {result.gradedCount} 个 · 响应 {responses.length} 次 ·
                容差 ±{FINAL_TEST_TOLERANCE_MS}ms · 计至{" "}
                {result.endTime.toFixed(1)} 秒 · 最高连击 ×{maxCombo} · 演出分{" "}
                {score} · 难度{" "}
                {DIFFICULTIES.find((d) => d.id === difficulty)?.label || "困难"}
              </p>
            </div>
            <div
              className={`finaltest-verdict ${result.passed ? "pass" : ""}`}
            >
              <strong>{pct(result.f1)}</strong>
              <span>Overall F1</span>
              <small>
                掌握线 {Math.round(finalTestPassRule.threshold * 100)}%（
                {finalTestPassRule.status}）
              </small>
            </div>
          </div>
          <div className="finaltest-metrics">
            <div>
              <b>{pct(result.overall.precision)}</b>
              <span>精确率 Precision</span>
            </div>
            <div>
              <b>{pct(result.overall.recall)}</b>
              <span>召回率 Recall</span>
            </div>
            <div>
              <b>{result.tp}</b>
              <span>命中 TP</span>
            </div>
            <div>
              <b>{result.misclassified}</b>
              <span>认错技法</span>
            </div>
            <div>
              <b>{result.fp}</b>
              <span>误报 FP</span>
            </div>
            <div>
              <b>{result.fn}</b>
              <span>漏检 FN</span>
            </div>
          </div>
          <table className="finaltest-table">
            <thead>
              <tr>
                <th>技法</th>
                <th>命中</th>
                <th>认错</th>
                <th>误报</th>
                <th>漏检</th>
                <th>F1</th>
              </tr>
            </thead>
            <tbody>
              {FINAL_TECHNIQUES.map((t) => {
                const p = result.perTechnique[t];
                if (!p) return null;
                return (
                  <tr key={t}>
                    <td>
                      <span
                        className="choice-dot"
                        style={{ background: techFor(t).color }}
                      />
                      {techFor(t).name}
                    </td>
                    <td>{p.tp}</td>
                    <td>{p.misclassified}</td>
                    <td>{p.fp}</td>
                    <td>{p.fn}</td>
                    <td>{pct(p.f1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {weak.length > 0 && (
            <div className="finaltest-weak">
              <p>
                薄弱技法：
                {weak.map((t) => techFor(t).name).join("、")}
                。建议回到技法工坊，跟着教练再练一遍。
              </p>
              <button
                className="secondary-button"
                onClick={() => game.navigate("challenge")}
              >
                去练习
              </button>
            </div>
          )}
          {result.passed && (
            <p className="finaltest-pass-note">
              本章以正式毫秒级数据通过，成绩已记入课程进度（不提交排行榜）。
            </p>
          )}
          <div className="finaltest-again">
            <button className="primary-button" onClick={start}>
              <RotateCcw size={15} />
              再来一局
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
