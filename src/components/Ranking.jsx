import { useState, useEffect, useRef } from "react";
import { Trophy, X, ArrowUpRight, Check } from "lucide-react";
import { summarize } from "../game/chart.js";
export const modes = {
  rhythm: "听见节奏",
  listening: "看懂技法（历史）",
  challenge: "技法挑战",
};
export function RankingHint({ game }) {
  const rank = game.ranking,
    score = summarize(game.results, game.notes.length).score,
    rows = rank.entries.filter((e) => e.mode === game.screen),
    target = [...rows]
      .filter((e) => e.score > score)
      .sort((a, b) => a.score - b.score)[0];
  return (
    <div className="ranking-hint">
      <span>
        上次得分{" "}
        <b>
          {rank.previous === null ? "首次挑战" : rank.previous.toLocaleString()}
        </b>
      </span>
      <span>
        {target ? (
          <>
            距 <b>{target.nickname}</b>
            {target.demo && <em>演示</em>} 还差{" "}
            <b>{(target.score - score).toLocaleString()}</b> 分
          </>
        ) : rows.length ? (
          "已超过当前榜单最高分"
        ) : (
          "完成本轮，留下你的成绩"
        )}
      </span>
      <button onClick={rank.open}>
        <Trophy size={14} />
        排行榜
      </button>
    </div>
  );
}
export default function RankingDialog({ ranking }) {
  const [nickname, setNickname] = useState(() => {
      try {
        return localStorage.getItem("qira-nickname") || "";
      } catch {
        return "";
      }
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    dialog = useRef(null);
  useEffect(() => {
    const prior = document.activeElement;
    const node = dialog.current;
    node.querySelector("input,button")?.focus();
    const key = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        ranking.close();
      }
      if (e.key === "Tab") {
        const items = [
          ...node.querySelectorAll(
            "button:not(:disabled),input:not(:disabled)",
          ),
        ];
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      prior?.focus?.();
    };
  }, []);
  const rows = ranking.entries
      .filter((e) => e.mode === ranking.mode)
      .sort(
        (a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt),
      ),
    own = ranking.run && rows.findIndex((e) => e.id === ranking.run.runId),
    rank = own >= 0 ? own + 1 : null;
  return (
    <div className="ranking-backdrop">
      <section
        className="ranking-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ranking-title"
        ref={dialog}
      >
        <button
          className="ranking-close icon-button"
          aria-label="关闭排行榜"
          onClick={ranking.close}
        >
          <X size={21} />
        </button>
        <div className="ranking-title">
          <Trophy size={25} />
          <div>
            <p>QIRA SENSE · 挑战榜</p>
            <h2 id="ranking-title">
              {ranking.run ? "让这一次，被看见" : "与更多听友一起进步"}
            </h2>
          </div>
        </div>
        {ranking.run && (
          <div className="ranking-submit">
            <div>
              <span>本次得分</span>
              <strong>{ranking.run.score.toLocaleString()}</strong>
              <small>
                上次{" "}
                {ranking.previous === null
                  ? "尚无记录"
                  : ranking.previous.toLocaleString() + " 分"}
              </small>
            </div>
            {ranking.submitted ? (
              <p className="ranking-success">
                <Check size={20} />
                成绩已上传{rank ? ` · 当前第 ${rank} 名` : ""}
              </p>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (busy) return;
                  setBusy(true);
                  setError("");
                  try {
                    await ranking.submit(nickname.trim());
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label htmlFor="ranking-nickname">留下昵称，无需注册</label>
                <div>
                  <input
                    id="ranking-nickname"
                    maxLength={20}
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="输入你的昵称"
                    autoComplete="nickname"
                    disabled={busy}
                  />
                  <button
                    className="primary-button"
                    disabled={busy || !nickname.trim()}
                  >
                    {busy ? "正在上传…" : "上传成绩"}
                    <ArrowUpRight size={16} />
                  </button>
                </div>
                <small>昵称与成绩将展示在此站点榜单中。</small>
              </form>
            )}
            {error && (
              <p role="alert" className="ranking-error">
                {error}
              </p>
            )}
          </div>
        )}
        <div className="ranking-tabs" role="tablist" aria-label="选择游戏榜单">
          {Object.entries(modes).map(([id, name]) => (
            <button
              key={id}
              role="tab"
              aria-selected={ranking.mode === id}
              onClick={() => ranking.setMode(id)}
            >
              {name}
            </button>
          ))}
        </div>
        <p className="ranking-note">
          {ranking.online
            ? "站点共享榜单"
            : "当前仅显示演示榜单 · 排行榜服务未连接"}{" "}
          · 标有“演示”的昵称与成绩为虚拟数据
        </p>
        <ol className="ranking-list">
          {rows.slice(0, 30).map((e, i) => (
            <li
              key={e.id}
              className={e.id === ranking.run?.runId ? "is-mine" : ""}
            >
              <span className="rank-number">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="rank-name">
                {e.nickname}
                {e.demo ? (
                  <em>演示</em>
                ) : e.id === ranking.run?.runId ? (
                  <em>本次</em>
                ) : null}
              </span>
              <strong>{e.score.toLocaleString()}</strong>
            </li>
          ))}
        </ol>
        {rank > 30 && (
          <p className="ranking-note">
            你的本次成绩排在第 {rank} 名。继续挑战，更进一步。
          </p>
        )}
        <button
          className="secondary-button ranking-return"
          onClick={ranking.close}
        >
          {ranking.run ? "返回本轮结果" : "继续体验"}
        </button>
      </section>
    </div>
  );
}
