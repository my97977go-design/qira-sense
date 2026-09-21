import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRankingStore, validateEntry } from "../scripts/ranking.mjs";
const entry = {
  runId: "test-run-123",
  mode: "rhythm",
  nickname: "小满",
  score: 12300,
  accuracy: 80,
};
test("score uploads persist across store restart and one run submits only once", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qira-ranking-")),
    file = path.join(dir, "scores.json");
  try {
    let store = createRankingStore(file, []);
    store.submit(entry);
    store.submit({ ...entry, nickname: "另一个名字", score: 15000 });
    assert.equal(store.list().length, 1);
    assert.equal(store.list()[0].nickname, "小满");
    store = createRankingStore(file, []);
    assert.equal(store.list()[0].score, 12300);
    assert.equal(store.list()[0].demo, false);
    assert.ok(!("runId" in store.list()[0]));
  } finally {
    fs.rmSync(file, { force: true });
    fs.rmdirSync(dir);
  }
});
test("upload validation rejects missing names, illegal values and unknown modes", () => {
  for (const change of [
    { nickname: "  " },
    { nickname: "a".repeat(21) },
    { score: -1 },
    { score: Infinity },
    { score: 2.5 },
    { accuracy: 101 },
    { mode: "unknown" },
    { runId: "bad" },
  ])
    assert.throws(() => validateEntry({ ...entry, ...change }));
  assert.equal(
    validateEntry({ ...entry, nickname: "  听风  " }).nickname,
    "听风",
  );
});
