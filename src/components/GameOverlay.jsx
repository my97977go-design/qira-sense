import { Play, RotateCcw, Headphones, ArrowUpRight } from "lucide-react";
import CourseResult from "./CourseResult.jsx";
import { Eyebrow } from "./Elements.jsx";
export default function GameOverlay({ game }) {
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
  if (game.status === "paused")
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
  if (game.status === "playing" && game.time < 0)
    return (
      <div
        className="countdown"
        role="status"
        aria-label={`准备开始 ${Math.ceil(-game.time)}`}
      >
        <i className="countdown-halo" />
        <small>准备开始</small>
        <strong key={Math.ceil(-game.time)}>{Math.ceil(-game.time)}</strong>
        <span>
          {game.screen === "rhythm"
            ? "两拍一次 · 跟随音乐"
            : "手指就位，音符正在靠近"}
        </span>
      </div>
    );
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
