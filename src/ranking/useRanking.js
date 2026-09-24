import { useState, useEffect, useRef } from "react";
import seeds from "../data/leaderboard.json";
const HISTORY = "qira-last-scores-v1";
const read = () => {
  try {
    return JSON.parse(localStorage.getItem(HISTORY)) || {};
  } catch {
    return {};
  }
};
export default function useRanking(game) {
  const [entries, setEntries] = useState(seeds),
    [online, setOnline] = useState(false),
    [opened, setOpened] = useState(false),
    [mode, setMode] = useState("rhythm"),
    [run, setRun] = useState(null),
    [submitted, setSubmitted] = useState(false),
    [history, setHistory] = useState(read),
    [previous, setPrevious] = useState(null),
    seen = useRef(null);
  const refresh = async () => {
    try {
      const res = await fetch("/api/leaderboard");
      if (!res.ok) throw Error();
      const data = await res.json();
      if (!Array.isArray(data.entries)) throw Error();
      setEntries(data.entries);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  };
  useEffect(() => {
    refresh();
  }, []);
  useEffect(() => {
    if (game.status !== "finished" || !game.summary) {
      setRun(null);
      if (game.status !== "paused") setOpened(false);
      return;
    }
    // 排行榜只服务既有游戏（跟拍节奏、技法工坊、下落式彩蛋）。
    // Adaptive Learning / Final Test 绝不自动提交，也不弹昵称窗口。
    if (!["rhythm", "challenge", "falling"].includes(game.screen)) return;
    if (seen.current === game.summary) return;
    seen.current = game.summary;
    const prior = read();
    setPrevious(prior[game.screen] ?? null);
    const next = { ...prior, [game.screen]: game.summary.score };
    setHistory(next);
    try {
      localStorage.setItem(HISTORY, JSON.stringify(next));
    } catch {}
    setRun({
      runId: crypto.randomUUID(),
      mode: game.screen,
      score: game.summary.score,
      accuracy: game.summary.accuracy,
    });
    setMode(game.screen);
    setSubmitted(false);
    setOpened(true);
    refresh();
  }, [game.status, game.summary]);
  const submit = async (nickname) => {
    const res = await fetch("/api/leaderboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...run, nickname }),
    });
    const data = await res
      .json()
      .catch(() => ({ error: "排行榜服务暂时不可用，请稍后重试。" }));
    if (!res.ok) throw Error(data.error || "上传失败，请重试。");
    if (!Array.isArray(data.entries)) throw Error("服务器未返回成绩，请重试。");
    setEntries(data.entries);
    setOnline(true);
    setSubmitted(true);
    try {
      localStorage.setItem("qira-nickname", nickname);
    } catch {}
  };
  return {
    entries,
    online,
    opened,
    mode,
    setMode,
    run,
    submitted,
    submit,
    previous:
      game.status === "finished" ? previous : (history[game.screen] ?? null),
    open: () => {
      if (game.status === "playing") game.togglePause();
      setMode(
        ["rhythm", "challenge", "falling"].includes(game.screen)
          ? game.screen
          : "rhythm",
      );
      setOpened(true);
      refresh();
    },
    close: () => setOpened(false),
  };
}
