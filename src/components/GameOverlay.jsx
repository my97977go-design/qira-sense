import { useLayoutEffect, useRef } from "react";
import { Play, RotateCcw, Headphones, ArrowUpRight } from "lucide-react";
import CourseResult from "./CourseResult.jsx";
import { Eyebrow } from "./Elements.jsx";
export default function GameOverlay({ game }) {
  const countdownRef = useRef(null);
  // 金色倒数盘与"按"圆盘圆心对齐：逐帧实测圆盘中心（倒数每拍都重渲染，
  // 顺带覆盖滚动/布局变化；非跟拍屏找不到 pulse-disc 则保持默认位置）。
  useLayoutEffect(() => {
    const el = countdownRef.current;
    if (!el) return;
    const page = el.parentElement,
      disc = page && page.querySelector(".pulse-disc");
    if (!disc) return;
    const pr = page.getBoundingClientRect(),
      dr = disc.getBoundingClientRect();
    el.style.left = `${dr.left - pr.left + dr.width / 2}px`;
    el.style.top = `${dr.top - pr.top + dr.height / 2}px`;
  });
  const busy = ["loading", "analyzing"].includes(game.status);
  if (busy)
    return (
      <div className="game-overlay">
        <div className="loading-orbit" />
        <Eyebrow>正在准备原声</Eyebrow>
        <h2>
          {game.status === "analyzing" ? "正在分析音乐节拍" : "正在加载录音"}
        </h2>
        <p>
          {game.status === "analyzing"
            ? "正在分析拍速与拍点…"
            : "正在加载《大起板》原声…"}
        </p>
      </div>
    );
  if (game.status === "paused") {
    // 声音地图/技法训练暂停只靠圆形播放按钮的图标切换，不盖全屏遮罩，动画保持可见
    if (game.screen === "map" || game.screen === "challenge") return null;
    return (
      <div className="game-overlay">
        <Eyebrow>已暂停</Eyebrow>
        <h2>学习已暂停</h2>
        <button className="primary-button" onClick={game.togglePause}>
          <Play size={16} />
          继续播放
        </button>
        <button className="text-button" onClick={() => game.restartLesson()}>
          重新开始
        </button>
      </div>
    );
  }
  if (game.status === "error")
    return (
      <div className="game-overlay">
        <Headphones size={30} />
        <h2>声音还没准备好</h2>
        <p role="alert">{game.error}</p>
        <button className="primary-button" onClick={() => game.restartLesson()}>
          重新尝试 <RotateCcw size={16} />
        </button>
        <button className="text-button" onClick={() => game.navigate("home")}>
          返回首页
        </button>
      </div>
    );
  if (game.status === "armed") {
    // 技法训练（教练模式）自己管理“认识→跟练”流程，不弹全屏确认遮罩
    if (game.screen === "challenge") return null;
    return (
      <div className="game-overlay arm-overlay">
        <Eyebrow>原声已就绪</Eyebrow>
        <h2>跟着节奏按！</h2>
        <p>
          {game.screen === "rhythm"
            ? "准备好了吗？点一下开始 —— 倒数八拍走完，音乐正好进场"
            : "准备好了吗？点一下开始，倒数之后音符就会靠近"}
        </p>
        <button className="arm-button" onClick={game.confirm}>
          准备好了，开始！
        </button>
      </div>
    );
  }
  if (
    game.status === "playing" &&
    game.screen !== "challenge" &&
    (game.screen === "rhythm" ? game.countdown > 0 : game.time < 0)
  ) {
    // 跟拍游戏：预备拍按当前 BPM 走满 8 拍（8-7-…-1），与逐点闪烁、模拟点击同拍；
    // 其余游戏保留按秒倒数。
    const prep = (game.countdownTotal || 0) / 8,
      prepBeat =
        game.screen === "rhythm" && prep > 0
          ? Math.min(
              7,
              Math.max(
                0,
                Math.floor((game.countdownTotal - game.countdown) / prep),
              ),
            )
          : -1,
      num = prepBeat >= 0 ? 8 - prepBeat : Math.ceil(-game.time);
    return (
      <div
        ref={countdownRef}
        className="countdown"
        role="status"
        aria-label={`准备开始 ${num}`}
      >
        <i
          className="countdown-halo"
          style={prepBeat >= 0 ? { animationDuration: `${prep * 2}s` } : undefined}
        />
        <small>准备开始</small>
        <strong
          key={num}
          style={
            prepBeat >= 0
              ? { animationDuration: `${Math.min(prep, 0.5)}s` }
              : undefined
          }
        >
          {num}
        </strong>
        <span
          key={prepBeat >= 0 ? `call-${num}` : "hint"}
          className={prepBeat >= 0 ? "countdown-call" : undefined}
          style={
            prepBeat >= 0
              ? { animationDuration: `${Math.min(prep * 0.96, 1)}s` }
              : undefined
          }
        >
          {prepBeat >= 0
            ? "按我！按我！"
            : game.screen === "rhythm"
              ? "一拍一次 · 跟随音乐"
              : "手指就位，音符正在靠近"}
        </span>
      </div>
    );
  }
  if (game.status === "finished" && game.summary) {
    const s = game.summary;
    return (
      <div className="game-overlay results-overlay">
        <Eyebrow>本关练习结果</Eyebrow>
        <h2>
          {s.accuracy >= 80 ? "这一轮，很合拍。" : "每一拍，都算数。"}
        </h2>
        <div className="result-score">
          <strong>{s.score.toLocaleString()}</strong>
          <span>本轮得分</span>
        </div>
        <div className="result-stats">
          <div>
            <strong>
              {s.accuracy}
              <small>%</small>
            </strong>
            <span>命中率</span>
          </div>
          <div>
            <strong>{s.bestCombo}</strong>
            <span>最高连击</span>
          </div>
          <div>
            <strong>{s.perfect}</strong>
            <span>精准命中</span>
          </div>
          <div>
            <strong>{s.miss}</strong>
            <span>漏拍</span>
          </div>
        </div>
        {game.lesson && <CourseResult game={game} />}
        <button className="text-button" onClick={game.ranking.open}>
          {game.ranking.submitted ? "查看本次排名" : "填写昵称，上传成绩"}
        </button>
        <div className="result-actions">
          <button
            className="primary-button"
            onClick={() => game.restartLesson()}
          >
            <RotateCcw size={16} />
            再来一次
          </button>
          <button
            className="secondary-button"
            onClick={() => game.navigate("home")}
          >
            返回课程地图
            <ArrowUpRight size={16} />
          </button>
        </div>
      </div>
    );
  }
  return null;
}
