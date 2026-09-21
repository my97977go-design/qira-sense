import fs from "node:fs";
import path from "node:path";
export function validateEntry(body) {
  if (!body || !["rhythm", "listening", "challenge"].includes(body.mode))
    throw Error("请选择有效的游戏。");
  const nickname =
    typeof body.nickname === "string" ? body.nickname.trim() : "";
  if (
    !nickname ||
    [...nickname].length > 20 ||
    /[\u0000-\u001f\u007f]/u.test(nickname)
  )
    throw Error("昵称请填写 1—20 个字符。");
  if (
    !Number.isInteger(body.score) ||
    body.score < 0 ||
    body.score > 1000000 ||
    !Number.isFinite(body.accuracy) ||
    body.accuracy < 0 ||
    body.accuracy > 100
  )
    throw Error("成绩格式不正确。");
  if (
    typeof body.runId !== "string" ||
    !/^[-a-zA-Z0-9]{8,80}$/.test(body.runId)
  )
    throw Error("本轮编号无效，请重新完成游戏。");
  return {
    runId: body.runId,
    mode: body.mode,
    nickname,
    score: body.score,
    accuracy: Math.round(body.accuracy),
  };
}
export function createRankingStore(file, seeds) {
  let rows = [];
  if (fs.existsSync(file)) {
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(saved)) throw Error("排行榜文件格式损坏");
    rows = saved;
  }
  const list = () =>
    [...seeds, ...rows]
      .sort(
        (a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt),
      )
      .map(({ runId, ...entry }) => entry);
  return {
    list,
    submit(body) {
      const value = validateEntry(body);
      const old = rows.find((r) => r.runId === value.runId);
      if (old) return old;
      const entry = {
        ...value,
        id: value.runId,
        demo: false,
        createdAt: new Date().toISOString(),
      };
      const next = [...rows, entry].slice(-3000);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file + ".tmp", JSON.stringify(next, null, 2));
      fs.renameSync(file + ".tmp", file);
      rows = next;
      return entry;
    },
  };
}
